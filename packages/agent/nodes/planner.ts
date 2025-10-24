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
  'chat.respond',
] as const;

type AllowedTool = (typeof TOOL_WHITELIST)[number];

// Chat-only tiny helper
function chatOnlyPlan(prompt?: string): PlanStep[] {
  return finalizeSteps([
    {
      tool: 'chat.respond' as AllowedTool,
      args: {
        prompt: prompt ?? '',
        system:
          'You are a helpful assistant. If no tool fits, answer normally. Keep it concise unless asked for details.',
      },
    },
  ]);
}

// Step schema the LLM returns
const StepInSchema = z.object({
  tool: z.enum(TOOL_WHITELIST),
  args: z.record(z.string(), z.any()).default({}),
});

// ✅ New: typed questions for structured UI
const QuestionSchema = z.object({
  key: z.string(),                // e.g., "when.startISO"
  question: z.string(),           // human prompt (label)
  type: z.enum([
    'datetime', // ISO 8601 date-time
    'date',     // YYYY-MM-DD
    'time',     // HH:mm
    'text',     // free text (fallback)
    'number',
    'select',
    'multiselect',
  ]).default('text'),
  required: z.boolean().default(true),
  options: z.array(z.string()).optional(),   // for select/multiselect
  placeholder: z.string().optional(),        // UI hint
  format: z.string().optional(),             // regex or named format (e.g., "email","email_list","iso8601")
  rationale: z.string().optional(),          // optional explanation for UI/tooling
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
    const risk =
      st.tool === 'calendar.createEvent' || (typeof st.tool === 'string' && st.tool.endsWith('_write'))
        ? 'high'
        : 'low';
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

/* ------------------ Prompts (general, typed questions) ------------------ */

function buildSystemPrompt() {
  return [
    'You are a strict planner that outputs ONLY valid JSON. No prose.',
    '',
    'Output a single JSON object with this structure:',
    '{',
    '  "steps": [ { "tool": <allowed>, "args": { /* minimal args to execute */ } } ],',
    '  "questions": [',
    '     {',
    '       "key": string,',
    '       "question": string,',
    '       "type": "datetime" | "date" | "time" | "text" | "textarea" | "email" | "email_list" | "number" | "select" | "multiselect",',
    '       "required"?: boolean,',
    '       "options"?: string[],',
    '       "placeholder"?: string,',
    '       "format"?: string,',
    '       "rationale"?: string',
    '     }',
    '  ]',
    '}',
    '',
    'Global rules:',
    '- Output ONLY a single JSON object matching the schema above.',
    '- Use ONLY tools from the allowed list the user provides.',
    '- Do NOT invent tools, fields, or values.',
    '- Keep args minimal but sufficient for the executor to run.',
    '- Use provided ISO timestamps; do NOT fabricate times.',
    '- Do NOT expose PII beyond what is provided; attendees may be redacted.',
    '- If required information is missing, DO NOT guess.',
    "  Populate 'questions' with specific inputs using the correct 'type' and optional 'options'.",
    "- Prefer structured types when clear (datetime/date/time/number/select/multiselect). Use 'text' only as fallback.",
    '',
    'Tool-specific guidance:',
    '- calendar.schedule canonical order: calendar.checkAvailability → calendar.createEvent → (optional) slack.postMessage',
    "- If a Slack target is present, add slack.postMessage AFTER calendar.createEvent and include { channel, text }.",
    '',
    'Validation hints:',
    "- For date-time: type='datetime', format='iso8601'.",
    "- For email address: type='text', format='email' (or 'email_list' if multiple).",
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
      when: { start, end }, // may be nulls
      attendeesPreview,
      targets: slackChannel ? { slack: { channel: slackChannel } } : {},
    },

    // Examples the model can pattern-match against
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
        description: 'calendar.schedule MISSING → ask typed questions (no guessing)',
        input: {
          intent: 'calendar.schedule',
          context: {
            title: 'Team Sync',
            when: { start: null, end: null },
            attendeesPreview: ['****'],
          },
          allowedTools: ['calendar.checkAvailability', 'calendar.createEvent'],
        },
        expected_output: {
          steps: [],
          questions: [
            {
              key: 'when.startISO',
              question: 'What start time should I use for the meeting?',
              type: 'datetime',
              required: true,
              placeholder: '2025-10-24T10:00:00Z',
              format: 'iso8601',
              rationale: 'Required to check availability and create the event.',
            },
            {
              key: 'when.endISO',
              question: 'What end time should I use for the meeting?',
              type: 'datetime',
              required: true,
              placeholder: '2025-10-24T10:30:00Z',
              format: 'iso8601',
            },
          ],
        },
      },
      {
        description: 'email.send MISSING → typed questions',
        input: {
          intent: 'email.send',
          context: { subject: null, toPreview: [], summary: null },
          allowedTools: ['email.send'],
        },
        expected_output: {
          steps: [],
          questions: [
            { key: 'email.to', question: 'Who should receive the email?', type: 'text', format: 'email_list', placeholder: 'alice@example.com, bob@acme.com' },
            { key: 'email.subject', question: 'Email subject?', type: 'text', placeholder: 'Quick intro' },
            { key: 'email.body', question: 'What should I say?', type: 'text', placeholder: 'Draft the message…' },
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

  const questions = [...(drafted.questions ?? [])];

  // 1) Filter to allowed tools (defensive)
  let steps = (drafted.steps ?? []).filter((st) => TOOL_WHITELIST.includes(st.tool as AllowedTool));

  // 2) If schedule intent & times missing → force typed questions, clear steps
  const isSchedule = s.scratch?.intent === INTENT.CALENDAR_SCHEDULE;
  const missingTimes = isSchedule && (!start || !end);

  if (isSchedule) {
    if (missingTimes) {
      const keys = new Set(questions.map((q) => q.key));
      if (!keys.has('when.startISO')) {
        questions.push({
          key: 'when.startISO',
          question: 'What start time should I use for the meeting (ISO 8601)?',
          type: 'datetime',
          required: true,
          placeholder: '2025-10-24T10:00:00Z',
          format: 'iso8601',
          rationale: 'Required to check availability and create the event.',
        });
      }
      if (!keys.has('when.endISO')) {
        questions.push({
          key: 'when.endISO',
          question: 'What end time should I use for the meeting (ISO 8601)?',
          type: 'datetime',
          required: true,
          placeholder: '2025-10-24T10:30:00Z',
          format: 'iso8601',
        });
      }
      steps = [];
    } else {
      // Ensure canonical steps and normalize args
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
  const confidence = (s.scratch as any)?.intentMeta?.confidence ?? 0;
  const userText =
    s.input.prompt ??
    (s.input.messages?.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n') ?? '');

  let steps: PlanStep[] | null = null;
  let questions: z.infer<typeof QuestionSchema>[] = [];

  // 1) Explicit chat.respond → chat-only
  if (intent === 'chat.respond') {
    steps = chatOnlyPlan(userText);

    const diff = safe({
      summary: 'Answer with assistant (chat.respond).',
      steps: steps.map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
      questions: [],
      intentDesc: INTENTS.find((x) => x.id === intent)?.desc,
    });

    events.planReady(s, eventBus, safe(steps), diff);

    return {
      scratch: { ...s.scratch, plan: steps, missing: [] },
      output: { ...s.output, diff },
    };
  }

  // 2) Unknown/low-confidence → answer normally (no tools)
  if (!intent || intent === (INTENT as any).UNKNOWN || confidence < 0.6) {
    steps = chatOnlyPlan(userText);

    const diff = safe({
      summary: 'Answer normally (no tools).',
      steps: steps.map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
      questions: [],
      intentDesc: INTENTS.find((x) => x.id === intent)?.desc,
    });

    events.planReady(s, eventBus, safe(steps), diff);

    return {
      scratch: { ...s.scratch, plan: steps, missing: [] },
      output: { ...s.output, diff },
    };
  }

  // 3) Try LLM planning
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

  // 4) Deterministic fallback for calendar.schedule if nothing produced
  if ((!steps || steps.length === 0) && (!questions || questions.length === 0)) {
    if (intent === INTENT.CALENDAR_SCHEDULE) {
      const { start, end } = resolveWhen(s);
      if (!start || !end) {
        questions = [
          {
            key: 'when.startISO',
            question: 'What start time should I use for the meeting (ISO 8601)?',
            type: 'datetime',
            required: true,
            placeholder: '2025-10-24T10:00:00Z',
            format: 'iso8601',
          },
          {
            key: 'when.endISO',
            question: 'What end time should I use for the meeting (ISO 8601)?',
            type: 'datetime',
            required: true,
            placeholder: '2025-10-24T10:30:00Z',
            format: 'iso8601',
          },
        ];
        steps = [];
      } else {
        steps = fallbackSchedulePlan(s);
      }
    }
  }

  const diff = safe({
    summary:
      steps && steps.length > 0
        ? `Proposed actions: ${steps.map((x) => x.tool.split('.').pop()).join(' → ')}`
        : questions && questions.length > 0
          ? `Missing information needed: ${questions.map((q) => q.key).join(', ')}`
          : 'No actions proposed.',
    steps: (steps ?? []).map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
    questions,
    intentDesc: INTENTS.find((x) => x.id === intent)?.desc,
  });

  events.planReady(s, eventBus, safe(steps ?? []), diff);

  return {
    scratch: { ...s.scratch, plan: steps ?? [], missing: questions ?? [] },
    output: { ...s.output, diff },
  };
};
