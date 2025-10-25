// packages/agent/nodes/planner.ts
import type { Node } from '../runtime/graph';
import type { RunState, PlanStep } from '../state/types';
import { events } from '../observability/events';
import { INTENTS, type IntentId, INTENT } from './intents';
import { z } from 'zod';
import type { RunEventBus } from '@quikday/libs';
import type { LLM } from '../llm/types';

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

// Step schema the LLM returns
const StepInSchema = z.object({
  tool: z.enum(TOOL_WHITELIST),
  args: z.record(z.string(), z.any()).default({}),
});

// ✅ Typed questions for structured UI
const QuestionSchema = z.object({
  key: z.string(),
  question: z.string(),
  type: z.enum([
    'datetime',
    'date',
    'time',
    'text',
    'textarea',
    'email',
    'email_list',
    'number',
    'select',
    'multiselect',
  ]).default('text'),
  required: z.boolean().default(true),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
  format: z.string().optional(),
  rationale: z.string().optional(),
});

// ✅ Inputs sections: required as list, valid as key->value map
const InputsMetaSchema = z.object({
  required_inputs: z.array(z.string()).default([]),
  valid_inputs: z.record(z.string(), z.any()).default({}),
});

const PlanInSchema = z.object({
  steps: z.array(StepInSchema).min(0),
  questions: z.array(QuestionSchema).optional(),
}).merge(InputsMetaSchema);

/* ------------------ Small Helpers ------------------ */

const safe = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const sid = (n: number) => `step-${String(n).padStart(2, '0')}`;

const getSlackChannel = (s: RunState) =>
  (s.scratch as any)?.intentMeta?.targets?.slack?.channel as string | undefined;

const getAttendeesPreview = (s: RunState) =>
  (((s.scratch as any)?.entities?.emails as string[]) ?? []).map(() => '****');

const isEmail = (v?: string) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function getEmailsFromAnswers(s: RunState): string[] {
  const ans = (s.scratch as any)?.answers ?? {};
  const out = new Set<string>();
  const add = (v?: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach((x) => add(x));
    else if (typeof v === 'string') v.split(',').forEach((x) => {
      const t = x.trim();
      if (isEmail(t)) out.add(t);
    });
  };
  add(ans['attendees.emails']);
  add(ans['email.to']);
  return Array.from(out);
}

function getEmailsFromEntities(s: RunState): string[] {
  const ents = (s.scratch as any)?.entities;
  const emails = Array.isArray(ents?.emails) ? (ents.emails as string[]) : [];
  return emails.filter((e) => isEmail(e));
}

function getEmailsFromTargets(s: RunState): string[] {
  const targets = (s.scratch as any)?.intentMeta?.targets ?? {};
  const attendees = Array.isArray(targets?.attendees) ? (targets.attendees as string[]) : [];
  return attendees.filter((e) => isEmail(e));
}

function deriveAttendeesCsv(s: RunState): string | undefined {
  const emails = new Set<string>();
  getEmailsFromAnswers(s).forEach((e) => emails.add(e));
  getEmailsFromEntities(s).forEach((e) => emails.add(e));
  getEmailsFromTargets(s).forEach((e) => emails.add(e));
  if (emails.size === 0) return undefined;
  return Array.from(emails).join(', ');
}

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

/* ------------------ NEW: Inputs computation ------------------ */

function requiredInputsForIntent(intent: IntentId): string[] {
  switch (intent) {
    case INTENT.CALENDAR_SCHEDULE:
      return ['attendees.emails', 'when.startISO', 'when.endISO'];
    case 'email.send':
      return ['email.to', 'email.subject', 'email.body'];
    default:
      return [];
  }
}

// Return a map of key -> extracted value (not just presence)
function validInputsFromState(s: RunState): Record<string, any> {
  const { start, end } = resolveWhen(s);
  const dict: Record<string, any> = {};
  if (start) dict['when.startISO'] = start;
  if (end) dict['when.endISO'] = end;

  const attendeesCsv = deriveAttendeesCsv(s);
  if (attendeesCsv) dict['attendees.emails'] = attendeesCsv;

  // Email.send fields from answers (authoritative if present)
  const ans = (s.scratch as any)?.answers ?? {};
  if (typeof ans['email.to'] === 'string' && ans['email.to'].trim()) {
    dict['email.to'] = ans['email.to'].trim();
  }
  if (typeof ans['email.subject'] === 'string' && ans['email.subject'].trim()) {
    dict['email.subject'] = ans['email.subject'].trim();
  }
  if (typeof ans['email.body'] === 'string' && ans['email.body'].trim()) {
    dict['email.body'] = ans['email.body'].trim();
  }
  return dict;
}

/* ------------------ Fallbacks ------------------ */

function fallbackSchedulePlan(s: RunState): PlanStep[] {
  const { start, end } = resolveWhen(s);
  const title = getTitle(s);
  const slackChannel = getSlackChannel(s);

  const core: Omit<PlanStep, 'id' | 'risk' | 'dependsOn'>[] = [
    { tool: 'calendar.checkAvailability', args: { start, end, attendees: deriveAttendeesCsv(s) } },
    {
      tool: 'calendar.createEvent',
      args: {
        title,
        start,
        end,
        attendees: deriveAttendeesCsv(s),
        notifyAttendees: true,
        location: 'Google Meet',
      },
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
async function planWithLLM(llm: LLM, s: RunState, system: string, user: string): Promise<string | null> {
  try {
    return await llm.text({
      system,
      user,
      temperature: 0,
      maxTokens: 700,
      timeoutMs: 15_000,
      metadata: {
        requestType: 'planner',
        apiEndpoint: 'planner.plan',
        runId: s.ctx.runId as any,
        userId: s.ctx.userId as any,
        teamId: (s.ctx.teamId as any) ?? undefined,
      },
    });
  } catch {
    return null;
  }
}

/* ------------------ Prompts (include inputs + today/tz, valid_inputs as dict) ------------------ */

function buildSystemPrompt() {
  return [
    'You are a strict planner that outputs ONLY valid JSON. No prose.',
    '',
    'Output a single JSON object with this structure:',
    '{',
    '  "steps": [ { "tool": <allowed>, "args": { /* minimal args to execute */ } } ],',
    '  "required_inputs": string[],',
    '  "valid_inputs": { [key: string]: any },',
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
    '- Treat "today" and relative dates in the provided timezone.',
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
    "- For date-time: type=\"datetime\", format=\"iso8601\".",
    "- For email address: use type=\"text\" with format=\"email\" (or \"email_list\" for multiple).",
  ].join('\n');
}

function buildUserPrompt(s: RunState, intent: IntentId) {
  const { start, end } = resolveWhen(s);
  const title = getTitle(s);
  const attendeesPreview = getAttendeesPreview(s);
  const slackChannel = getSlackChannel(s);

  const todayISO = (s.ctx.now instanceof Date ? s.ctx.now : new Date()).toISOString();
  const timezone = s.ctx.tz || 'UTC';

  const required_inputs = requiredInputsForIntent(intent);
  const valid_inputs = validInputsFromState(s);

  const payload = {
    intent,
    allowedTools: TOOL_WHITELIST,
    meta: { todayISO, timezone },
    context: {
      title,
      when: { start, end }, // may be nulls
      attendeesPreview,
      targets: slackChannel ? { slack: { channel: slackChannel } } : {},
    },
    required_inputs,
    valid_inputs,

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
          required_inputs: ['attendees.emails', 'when.startISO', 'when.endISO'],
          valid_inputs: { 'when.startISO': '2025-10-23T20:00:00Z', 'when.endISO': '2025-10-23T20:30:00Z' },
        },
        expected_output: {
          steps: [
            { tool: 'calendar.checkAvailability', args: { start: '2025-10-23T20:00:00Z', end: '2025-10-23T20:30:00Z' } },
            { tool: 'calendar.createEvent', args: { title: 'Online call', start: '2025-10-23T20:00:00Z', end: '2025-10-23T20:30:00Z', notifyAttendees: true } },
            { tool: 'slack.postMessage', args: { channel: '#general', text: 'Scheduled: *Online call* from 20:00 to 20:30. Invites sent.' } },
          ],
          required_inputs: ['attendees.emails', 'when.startISO', 'when.endISO'],
          valid_inputs: { 'when.startISO': '2025-10-23T20:00:00Z', 'when.endISO': '2025-10-23T20:30:00Z' },
          questions: [
            {
              key: 'attendees.emails',
              question: 'Who should be invited? (emails)',
              type: 'email_list',
              required: true,
              placeholder: 'sara@example.com, alex@acme.com',
              rationale: 'Needed to send calendar invites.',
            },
          ],
        },
      },
      {
        description: 'calendar.schedule MISSING → ask typed questions (no guessing)',
        input: {
          intent: 'calendar.schedule',
          context: { title: 'Team Sync', when: { start: null, end: null }, attendeesPreview: ['****'] },
          allowedTools: ['calendar.checkAvailability', 'calendar.createEvent'],
          required_inputs: ['attendees.emails', 'when.startISO', 'when.endISO'],
          valid_inputs: {},
        },
        expected_output: {
          steps: [],
          required_inputs: ['attendees.emails', 'when.startISO', 'when.endISO'],
          valid_inputs: {},
          questions: [
            { key: 'when.startISO', question: 'What start time should I use for the meeting?', type: 'datetime', required: true, placeholder: '2025-10-24T10:00:00Z', format: 'iso8601', rationale: 'Required to check availability and create the event.' },
            { key: 'when.endISO', question: 'What end time should I use for the meeting?', type: 'datetime', required: true, placeholder: '2025-10-24T10:30:00Z', format: 'iso8601' },
            { key: 'attendees.emails', question: 'Who should be invited? (emails)', type: 'email_list', required: true, placeholder: 'sara@example.com, alex@acme.com' },
          ],
        },
      },
      {
        description: 'email.send MISSING → typed questions',
        input: {
          intent: 'email.send',
          context: { subject: null, toPreview: [], summary: null },
          allowedTools: ['email.send'],
          required_inputs: ['email.to', 'email.subject', 'email.body'],
          valid_inputs: {},
        },
        expected_output: {
          steps: [],
          required_inputs: ['email.to', 'email.subject', 'email.body'],
          valid_inputs: {},
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
  required_inputs: string[];
  valid_inputs: Record<string, any>;
} {
  const { start, end } = resolveWhen(s);
  const title = getTitle(s);
  const slackChannel = getSlackChannel(s);

  const questions = [...(drafted.questions ?? [])];

  // 1) Filter to allowed tools (defensive)
  let steps = (drafted.steps ?? []).filter((st) => TOOL_WHITELIST.includes(st.tool as AllowedTool));

  // 2) Compute inputs (state first, then merge model-provided for extras)
  const intent = s.scratch?.intent as IntentId;
  const required_inputs = requiredInputsForIntent(intent);
  const state_valid = validInputsFromState(s);
  const model_valid = drafted.valid_inputs ?? {};
  const valid_inputs: Record<string, any> = { ...model_valid, ...state_valid }; // state wins

  // 3) If schedule intent & times missing → force typed questions, clear steps
  const isSchedule = intent === INTENT.CALENDAR_SCHEDULE;
  const missing = new Set(required_inputs.filter((k) => !(k in valid_inputs)));

  if (isSchedule) {
    if (missing.has('when.startISO') || missing.has('when.endISO')) {
      const keys = new Set(questions.map((q) => q.key));
      if (missing.has('when.startISO') && !keys.has('when.startISO')) {
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
      if (missing.has('when.endISO') && !keys.has('when.endISO')) {
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
        steps.unshift({
          tool: 'calendar.checkAvailability',
          args: { start, end, attendees: deriveAttendeesCsv(s) },
        });
      }
      if (!hasCreate) {
        steps.push({
          tool: 'calendar.createEvent',
          args: {
            title,
            start,
            end,
            attendees: deriveAttendeesCsv(s),
            notifyAttendees: true,
            location: 'Google Meet',
          },
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
          st.args = { start, end, attendees: deriveAttendeesCsv(s), ...(st.args ?? {}) };
        }
        if (st.tool === 'calendar.createEvent') {
          st.args = {
            title,
            start,
            end,
            attendees: deriveAttendeesCsv(s),
            notifyAttendees: true,
            location: 'Google Meet',
            ...(st.args ?? {}),
          };
        }
      }
    }

    // Ask for attendees emails if still missing
    if (missing.has('attendees.emails')) {
      const keys = new Set(questions.map((q) => q.key));
      if (!keys.has('attendees.emails')) {
        questions.push({
          key: 'attendees.emails',
          question: 'Who should be invited? (emails)',
          type: 'email_list',
          required: true,
          placeholder: 'sara@example.com, alex@acme.com',
          rationale: 'Needed to send calendar invites.',
        } as any);
      }
    }
  }

  return { steps: finalizeSteps(steps as any), questions, required_inputs, valid_inputs };
}

/* ------------------ Planner Node ------------------ */

export const makePlanner = (llm: LLM): Node<RunState, RunEventBus> => async (s, eventBus) => {
  const intent = s.scratch?.intent as IntentId | undefined;
  const confidence = (s.scratch as any)?.intentMeta?.confidence ?? 0;
  const userText =
    s.input.prompt ??
    (s.input.messages?.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n') ?? '');

  let steps: PlanStep[] | null = null;
  let questions: z.infer<typeof QuestionSchema>[] = [];
  let required_inputs: string[] = [];
  let valid_inputs: Record<string, any> = {};

  // 1) Explicit chat.respond → chat-only
  if (intent === 'chat.respond') {
    steps = finalizeSteps([{
      tool: 'chat.respond',
      args: {
        prompt: userText ?? '',
        system: 'You are a helpful assistant. If no tool fits, answer normally. Keep it concise unless asked for details.',
      },
    }]);
    const diff = safe({
      summary: 'Answer with assistant (chat.respond).',
      steps: steps.map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
      required_inputs: [],
      valid_inputs: {},
      questions: [],
      intentDesc: INTENTS.find((x) => x.id === intent)?.desc,
    });
    events.planReady(s, eventBus, safe(steps), diff);
    return { scratch: { ...s.scratch, plan: steps, missing: [] }, output: { ...s.output, diff } };
  }

  // 2) Unknown/low-confidence → answer normally (no tools)
  if (!intent || intent === (INTENT as any).UNKNOWN || confidence < 0.6) {
    steps = finalizeSteps([{
      tool: 'chat.respond',
      args: {
        prompt: userText ?? '',
        system: 'You are a helpful assistant. If no tool fits, answer normally. Keep it concise unless asked for details.',
      },
    }]);
    const diff = safe({
      summary: 'Answer normally (no tools).',
      steps: steps.map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
      required_inputs: [],
      valid_inputs: {},
      questions: [],
      intentDesc: INTENTS.find((x) => x.id === intent)?.desc,
    });
    events.planReady(s, eventBus, safe(steps), diff);
    return { scratch: { ...s.scratch, plan: steps, missing: [] }, output: { ...s.output, diff } };
  }

  // 3) Try LLM planning
  if (intent) {
    const system = buildSystemPrompt();
    const user = buildUserPrompt(s, intent);
    const raw = await planWithLLM(llm, s, system, user);

    if (raw) {
      try {
        const parsed = PlanInSchema.parse(JSON.parse(raw));
        const hardened = patchAndHardenPlan(s, parsed);
        steps = hardened.steps;
        questions = hardened.questions;
        required_inputs = hardened.required_inputs.length
          ? hardened.required_inputs
          : requiredInputsForIntent(intent);
        // Always recompute valid from state and overlay model-provided extras (state wins)
        valid_inputs = { ...(parsed.valid_inputs ?? {}), ...validInputsFromState(s) };
      } catch {
        steps = null; // fall back
      }
    }
  }

  // 4) Deterministic fallback for calendar.schedule if nothing produced
  if ((!steps || steps.length === 0) && (!questions || questions.length === 0)) {
    if (intent === INTENT.CALENDAR_SCHEDULE) {
      required_inputs = requiredInputsForIntent(intent);
      valid_inputs = validInputsFromState(s);
      const { start, end } = resolveWhen(s);
      if (!start || !end) {
        const qs: z.infer<typeof QuestionSchema>[] = [];
        if (!start) qs.push({
          key: 'when.startISO',
          question: 'What start time should I use for the meeting (ISO 8601)?',
          type: 'datetime',
          required: true,
          placeholder: '2025-10-24T10:00:00Z',
          format: 'iso8601',
        });
        if (!end) qs.push({
          key: 'when.endISO',
          question: 'What end time should I use for the meeting (ISO 8601)?',
          type: 'datetime',
          required: true,
          placeholder: '2025-10-24T10:30:00Z',
          format: 'iso8601',
        });
        if (!('attendees.emails' in valid_inputs)) {
          qs.push({
            key: 'attendees.emails',
            question: 'Who should be invited? (emails)',
            type: 'email_list',
            required: true,
            placeholder: 'sara@example.com, alex@acme.com',
          } as any);
        }
        questions = qs;
        steps = [];
      } else {
        steps = fallbackSchedulePlan(s);
      }
    }
  }

  // 5) Build diff including inputs sections
  const diff = safe({
    summary:
      steps && steps.length > 0
        ? `Proposed actions: ${steps.map((x) => x.tool.split('.').pop()).join(' → ')}`
        : questions && questions.length > 0
          ? `Missing information needed: ${questions.map((q) => q.key).join(', ')}`
          : 'No actions proposed.',
    steps: (steps ?? []).map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
    required_inputs: required_inputs ?? [],
    valid_inputs: valid_inputs ?? {},
    questions,
    intentDesc: INTENTS.find((x) => x.id === intent)?.desc,
  });

  events.planReady(s, eventBus, safe(steps ?? []), diff);

  return {
    scratch: {
      ...s.scratch,
      plan: steps ?? [],
      missing: questions ?? [],
      inputs: { required: required_inputs, valid: valid_inputs },
    },
    output: { ...s.output, diff },
  };
};
