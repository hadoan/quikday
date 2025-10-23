// packages/agent/nodes/planner.ts
import type { Node } from '../runtime/graph';
import type { RunState, PlanStep } from '../state/types';
import { events } from '../observability/events';
import { INTENTS, type IntentId, INTENT } from './intents';
import { z } from 'zod';
import type { RunEventBus } from '@quikday/libs';

/* ------------------ Whitelist & Schemas ------------------ */

const TOOL_WHITELIST = [
  'calendar.checkAvailability',
  'calendar.createEvent',
  'slack.postMessage',
  'email.read',
  'email.send',
  'notion.upsert',
  'sheets.read',
  'sheets.write',
  'github.create_issue',
  'jira.create_issue',
] as const;

type AllowedTool = (typeof TOOL_WHITELIST)[number];

const StepInSchema = z.object({
  tool: z.enum(TOOL_WHITELIST),
  // z.record requires a key and value type in this zod version; use string keys.
  args: z.record(z.string(), z.any()).default({}),
});

const QuestionSchema = z.object({
  key: z.string(), // e.g., "when.startISO"
  question: z.string(), // e.g., "What start time should I use?"
  rationale: z.string().optional(), // optional explanation for UI
  options: z.array(z.string()).optional(), // optional multiple-choice
});

const PlanInSchema = z.object({
  steps: z.array(StepInSchema).min(0),
  questions: z.array(QuestionSchema).optional(),
});

/* ------------------ Small Helpers ------------------ */

const safe = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const sid = (n: number) => `step-${String(n).padStart(2, '0')}`;

const getSlackChannel = (s: RunState) =>
  (s.scratch as any)?.intentMeta?.targets?.slack?.channel as string | undefined;

const getAttendeesPreview = (s: RunState) =>
  (((s.scratch as any)?.entities?.emails as string[]) ?? []).map(() => '****');

const resolveWhen = (s: RunState) => {
  const start = (s.scratch as any)?.when?.startISO ?? (s.scratch as any)?.schedule?.start ?? null;
  const end = (s.scratch as any)?.when?.endISO ?? (s.scratch as any)?.schedule?.end ?? null;
  return { start, end };
};

const getTitle = (s: RunState) => (s.scratch as any)?.title ?? 'Online call';

/** Wire ids & naïve linear dependsOn; assign simple risk */
function finalizeSteps(steps: Omit<PlanStep, 'id' | 'risk' | 'dependsOn'>[]): PlanStep[] {
  return steps.map((st, i) => {
    const id = sid(i + 1);
    const dependsOn = i === 0 ? [] : [sid(i)];
    const risk = st.tool === 'calendar.createEvent' || st.tool.endsWith('_write') ? 'high' : 'low';
    return { id, dependsOn, risk, ...st };
  });
}

/* ------------------ Fallbacks ------------------ */

function fallbackSchedulePlan(s: RunState): PlanStep[] {
  const { start, end } = resolveWhen(s);
  const title = getTitle(s);
  const attendees = getAttendeesPreview(s);
  const slackChannel = getSlackChannel(s);

  const core: Omit<PlanStep, 'id' | 'risk' | 'dependsOn'>[] = [
    { tool: 'calendar.checkAvailability', args: { start, end, attendees } },
    {
      tool: 'calendar.createEvent',
      args: { title, start, end, attendees, notifyAttendees: true, location: 'Google Meet' },
    },
  ];

  if (slackChannel) {
    core.push({
      tool: 'slack.postMessage',
      args: {
        channel: slackChannel,
        text: `Scheduled: *${title}* from ${start} to ${end}. Invites sent. (<event_link>)`,
      },
    });
  }

  return finalizeSteps(core);
}

function devNoopFallback(prompt?: string): PlanStep[] {
  return finalizeSteps([
    { tool: 'noop' as any, args: { prompt: prompt ?? '', action: 'check_calendar' } },
    { tool: 'noop' as any, args: { prompt: prompt ?? '', action: 'create_event' } },
    { tool: 'noop' as any, args: { prompt: prompt ?? '', action: 'post_to_slack' } },
  ]);
}

/* ------------------ LLM glue ------------------ */

/**
 * Expect an LLM client on state services:
 * (s.services as any)?.llm.complete({ system, user, temperature: 0, response_format: { type: "json_object" } })
 */
async function callLLM(s: RunState, system: string, user: string): Promise<string | null> {
  const llm = (s as any)?.services?.llm as
    | {
        complete: (opts: {
          system: string;
          user: string;
          temperature?: number;
          response_format?: any;
        }) => Promise<string>;
      }
    | undefined;

  if (!llm) return null;

  try {
    return await llm.complete({
      system,
      user,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
  } catch {
    return null;
  }
}

/* ------------------ Prompts (with samples + questions) ------------------ */

function buildSystemPrompt() {
  return [
    'You are a strict planner that outputs ONLY valid JSON. No prose.',
    '',
    'JSON schema (conceptual):',
    '{',
    '  "steps": [ { "tool": <allowed>, "args": { /* minimal args */ } } ],',
    '  "questions": [ { "key": string, "question": string, "rationale"?: string, "options"?: string[] } ]',
    '}',
    '',
    'Global rules:',
    '- Output ONLY a single JSON object matching the schema above.',
    '- Use ONLY tools from the allowed list the user provides.',
    '- Do NOT invent tools, fields, or values.',
    '- Keep args minimal but sufficient for the executor to run.',
    '- Use provided ISO timestamps; do NOT fabricate times.',
    '- Do NOT expose PII beyond what is provided; attendees may be redacted.',
    '- Canonical order for calendar.schedule:',
    '  calendar.checkAvailability → calendar.createEvent → (optional) slack.postMessage',
    '- If a Slack channel target is present, add slack.postMessage AFTER calendar.createEvent.',
    '- If required information is missing (e.g., start or end time), DO NOT guess.',
    "  Instead, populate the 'questions' array with specific, concise questions,",
    '  and omit steps that depend on missing info.',
  ].join('\n');
}

function buildUserPrompt(s: RunState, intent: IntentId) {
  const { start, end } = resolveWhen(s);
  const title = getTitle(s);
  const attendeesPreview = getAttendeesPreview(s);
  const slackChannel = getSlackChannel(s);

  const payload = {
    intent,
    allowedTools: TOOL_WHITELIST,
    context: {
      title,
      when: { start, end },
      attendeesPreview,
      targets: slackChannel ? { slack: { channel: slackChannel } } : {},
    },

    // === Multi-sample guidance (good outputs) ===
    samples: [
      {
        description: 'calendar.schedule WITH Slack announcement',
        input: {
          intent: 'calendar.schedule',
          context: {
            title: 'Online call',
            when: { start: '2025-10-23T20:00:00Z', end: '2025-10-23T20:30:00Z' },
            attendeesPreview: ['****', '****'],
            targets: { slack: { channel: '#general' } },
          },
          allowedTools: ['calendar.checkAvailability', 'calendar.createEvent', 'slack.postMessage'],
        },
        expected_output: {
          steps: [
            {
              tool: 'calendar.checkAvailability',
              args: { start: '2025-10-23T20:00:00Z', end: '2025-10-23T20:30:00Z' },
            },
            {
              tool: 'calendar.createEvent',
              args: {
                title: 'Online call',
                start: '2025-10-23T20:00:00Z',
                end: '2025-10-23T20:30:00Z',
                notifyAttendees: true,
              },
            },
            {
              tool: 'slack.postMessage',
              args: {
                channel: '#general',
                text: 'Scheduled: *Online call* from 20:00 to 20:30. Invites sent.',
              },
            },
          ],
        },
      },
      {
        description: 'calendar.schedule WITHOUT Slack announcement',
        input: {
          intent: 'calendar.schedule',
          context: {
            title: 'Candidate Intro',
            when: { start: '2025-11-02T09:00:00Z', end: '2025-11-02T09:30:00Z' },
            attendeesPreview: ['****'],
          },
          allowedTools: ['calendar.checkAvailability', 'calendar.createEvent', 'slack.postMessage'],
        },
        expected_output: {
          steps: [
            {
              tool: 'calendar.checkAvailability',
              args: { start: '2025-11-02T09:00:00Z', end: '2025-11-02T09:30:00Z' },
            },
            {
              tool: 'calendar.createEvent',
              args: {
                title: 'Candidate Intro',
                start: '2025-11-02T09:00:00Z',
                end: '2025-11-02T09:30:00Z',
                notifyAttendees: true,
              },
            },
          ],
        },
      },
      {
        description: 'calendar.schedule MISSING DATES → ask questions (no guessing)',
        input: {
          intent: 'calendar.schedule',
          context: {
            title: 'Team Sync',
            when: { start: null, end: null },
            attendeesPreview: ['****'],
            targets: { slack: { channel: '#general' } },
          },
          allowedTools: ['calendar.checkAvailability', 'calendar.createEvent', 'slack.postMessage'],
        },
        expected_output: {
          steps: [], // cannot proceed without times
          questions: [
            {
              key: 'when.startISO',
              question: 'What start time should I use for the meeting?',
              rationale: 'Required to check availability and create the event.',
            },
            { key: 'when.endISO', question: 'What end time should I use for the meeting?' },
          ],
        },
      },
      {
        description: 'email.send basic example',
        input: {
          intent: 'email.send',
          context: {
            subject: 'Quick intro',
            toPreview: ['****'],
            summary: 'Short intro about the role.',
          },
          allowedTools: ['email.send'],
        },
        expected_output: {
          steps: [
            {
              tool: 'email.send',
              args: { subject: 'Quick intro', to: ['****'], body: 'Short intro about the role.' },
            },
          ],
        },
      },
    ],
  };

  return JSON.stringify(payload);
}

/* ------------------ Post-processing (patch/harden) ------------------ */

function patchAndHardenPlan(
  s: RunState,
  drafted: z.infer<typeof PlanInSchema>,
): {
  steps: PlanStep[];
  questions: z.infer<typeof QuestionSchema>[];
} {
  const { start, end } = resolveWhen(s);
  const title = getTitle(s);
  const attendees = getAttendeesPreview(s);
  const slackChannel = getSlackChannel(s);

  const questions = drafted.questions ?? [];

  // 1) Filter to allowed tools (defensive)
  let steps = (drafted.steps ?? []).filter((st) => TOOL_WHITELIST.includes(st.tool as AllowedTool));

  // 2) If schedule intent & times missing → force questions, clear steps
  const isSchedule = s.scratch?.intent === INTENT.CALENDAR_SCHEDULE;
  const missingTimes = isSchedule && (!start || !end);

  if (isSchedule) {
    if (missingTimes) {
      // Ensure required questions are present
      const keys = new Set(questions.map((q) => q.key));
      if (!keys.has('when.startISO')) {
        questions.push({
          key: 'when.startISO',
          question: 'What start time should I use for the meeting (ISO 8601)?',
          rationale: 'Required to check availability and create the event.',
        });
      }
      if (!keys.has('when.endISO')) {
        questions.push({
          key: 'when.endISO',
          question: 'What end time should I use for the meeting (ISO 8601)?',
        });
      }
      // Don’t proceed with steps yet
      steps = [];
    } else {
      // Ensure canonical steps
      const hasCreate = steps.some((s) => s.tool === 'calendar.createEvent');
      const hasCheck = steps.some((s) => s.tool === 'calendar.checkAvailability');

      if (hasCreate && !hasCheck) {
        steps.unshift({ tool: 'calendar.checkAvailability', args: { start, end, attendees } });
      }
      if (!hasCreate) {
        steps.push({
          tool: 'calendar.createEvent',
          args: { title, start, end, attendees, notifyAttendees: true, location: 'Google Meet' },
        });
      }
      const hasSlack = steps.some((s) => s.tool === 'slack.postMessage');
      if (slackChannel && !hasSlack) {
        steps.push({
          tool: 'slack.postMessage',
          args: {
            channel: slackChannel,
            text: `Scheduled: *${title}* from ${start} to ${end}. Invites sent. (<event_link>)`,
          },
        });
      }

      // Normalize args for calendar steps
      for (const st of steps) {
        if (st.tool === 'calendar.checkAvailability') {
          st.args = { start, end, attendees, ...(st.args ?? {}) };
        }
        if (st.tool === 'calendar.createEvent') {
          st.args = {
            title,
            start,
            end,
            notifyAttendees: true,
            location: 'Google Meet',
            ...(st.args ?? {}),
          };
        }
      }
    }
  }

  return { steps: finalizeSteps(steps as any), questions };
}

/* ------------------ Planner Node ------------------ */

export const planner: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const intent = s.scratch?.intent as IntentId | undefined;

  let steps: PlanStep[] | null = null;
  let questions: z.infer<typeof QuestionSchema>[] = [];

  // Try LLM planning if we have an LLM client
  if (intent) {
    const system = buildSystemPrompt();
    const user = buildUserPrompt(s, intent);
    const raw = await callLLM(s, system, user);

    if (raw) {
      try {
        const parsed = PlanInSchema.parse(JSON.parse(raw));
        const hardened = patchAndHardenPlan(s, parsed);
        steps = hardened.steps;
        questions = hardened.questions;
      } catch {
        steps = null; // fall back
      }
    }
  }

  // Deterministic fallback for calendar.schedule (only if no questions pending)
  if ((!steps || steps.length === 0) && (!questions || questions.length === 0)) {
    if (intent === INTENT.CALENDAR_SCHEDULE) {
      const { start, end } = resolveWhen(s);
      if (!start || !end) {
        // No times → synthesize questions
        questions = [
          {
            key: 'when.startISO',
            question: 'What start time should I use for the meeting (ISO 8601)?',
          },
          {
            key: 'when.endISO',
            question: 'What end time should I use for the meeting (ISO 8601)?',
          },
        ];
        steps = [];
      } else {
        steps = fallbackSchedulePlan(s);
      }
    }
  }

  // Dev NOOP fallback if still empty and no questions
  if ((!steps || steps.length === 0) && (!questions || questions.length === 0)) {
    steps = devNoopFallback(s.input.prompt);
  }

  // Build diff
  const diff = safe({
    summary:
      steps && steps.length > 0
        ? `Proposed actions: ${steps.map((x) => x.tool.split('.').pop()).join(' → ')}`
        : questions && questions.length > 0
          ? `Missing information needed: ${questions.map((q) => q.key).join(', ')}`
          : 'No actions proposed.',
    steps: (steps ?? []).map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
    questions, // expose to UI/Confirm node
    intentDesc: INTENTS.find((x) => x.id === intent)?.desc,
  });

  // Emit preview
  events.planReady(s, eventBus, safe(steps ?? []), diff);

  // Persist questions in scratch so your confirm/ask flow can prompt user
  return {
    scratch: { ...s.scratch, plan: steps ?? [], missing: questions ?? [] },
    output: { ...s.output, diff },
  };
};
