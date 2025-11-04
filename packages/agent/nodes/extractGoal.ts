import type { Node } from '../runtime/graph.js';
import type { RunState } from '../state/types.js';
import type { LLM } from '../llm/types.js';
import { z } from 'zod';

/**
 * Goal-oriented extraction schema
 * Extracts what the user wants to achieve without relying on predefined intents
 */
const GoalSchema = z.object({
  // The outcome the user wants to achieve
  outcome: z.string().describe('What the user wants to accomplish, in one sentence'),
  
  // Context about the request
  context: z.object({
    who: z.string().optional().describe('People involved (emails, names)'),
    what: z.string().optional().describe('Subject matter, content'),
    when: z.string().optional().describe('Time or timeframe (ISO 8601 or relative)'),
    where: z.string().optional().describe('Location, channel, platform'),
    constraints: z.array(z.string()).optional().describe('Limits, boundaries, what to avoid'),
  }).optional(),
  
  // What the user has provided
  provided: z.record(z.string(), z.unknown()).describe('Explicit values extracted from user input'),
  
  // What's missing to achieve the goal
  missing: z.array(z.object({
    key: z.string(),
    question: z.string(),
    type: z.string().optional(),
    required: z.boolean().optional(),
  })).optional().describe('Information needed to proceed'),
  
  // How we'll know it's done
  success_criteria: z.string().optional().describe('Definition of done'),
  
  // Confidence in understanding the goal
  confidence: z.number().min(0).max(1).default(0.7),
});

type GoalExtraction = z.infer<typeof GoalSchema>;

/**
 * System prompt for goal extraction
 */
function buildGoalExtractionPrompt(): string {
  return [
    'You are a goal-oriented assistant that understands what users want to achieve.',
    '',
    '**Your task:**',
    '1. Identify the OUTCOME the user wants (what they want to accomplish)',
    '2. Extract CONTEXT (who, what, when, where, constraints)',
    '3. Capture what they PROVIDED explicitly',
    '4. Identify what\'s MISSING to proceed',
    '5. Define success criteria if clear',
    '',
    '**Output format (strict JSON):**',
    '{',
    '  "outcome": "What the user wants to accomplish (one sentence)",',
    '  "context": {',
    '    "who": "People involved (optional)",',
    '    "what": "Subject matter (optional)",',
    '    "when": "Timeframe in ISO 8601 or relative (optional)",',
    '    "where": "Location/platform (optional)",',
    '    "constraints": ["What to avoid or limit (optional)"]',
    '  },',
    '  "provided": {',
    '    "key": "value extracted from user input"',
    '  },',
    '  "missing": [',
    '    { "key": "field_name", "question": "What do you need?", "type": "string|email|datetime|number", "required": true }',
    '  ],',
    '  "success_criteria": "How we know it\'s done (optional)",',
    '  "confidence": 0.0-1.0',
    '}',
    '',
    '**Rules:**',
    '- Output ONLY raw JSON, no markdown fences or code blocks',
    '- Extract values ONLY from what user explicitly provides',
    '- Do NOT invent or guess missing information',
    '- For dates/times: use ISO 8601 format or mark as missing',
    '- For emails: validate format or mark as missing',
    '- Be conservative: if unsure, lower confidence and flag as missing',
    '- Focus on the GOAL, not on categorizing into predefined intents',
    '',
    '**Important: Connected Integrations**',
    '- The user has connected integrations (Gmail, Calendar, Slack, etc.)',
    '- Email account, calendar settings, and platform credentials are ALREADY available from connected integrations',
    '- DO NOT ask for "email_account", "which email", or similar if the task involves email operations',
    '- DO NOT ask for platform credentials that are stored in connected apps',
    '- Only mark as "missing" information that the user must explicitly provide (like content, recipients, etc.)',
    '',
    '**Examples:**',
    '',
    '// User: "Schedule a call with jane@acme.com tomorrow at 3pm for 30 minutes"',
    '{',
    '  "outcome": "Schedule a meeting with jane@acme.com",',
    '  "context": {',
    '    "who": "jane@acme.com",',
    '    "when": "tomorrow at 3pm",',
    '    "what": "call"',
    '  },',
    '  "provided": {',
    '    "attendee_email": "jane@acme.com",',
    '    "duration_minutes": 30,',
    '    "relative_time": "tomorrow at 3pm"',
    '  },',
    '  "missing": [],',
    '  "success_criteria": "Meeting scheduled and attendee notified",',
    '  "confidence": 0.95',
    '}',
    '',
    '// User: "Draft follow-up emails for no-reply threads from the last 7 days"',
    '{',
    '  "outcome": "Create polite follow-up drafts for no-reply threads from the last 7 days",',
    '  "context": {',
    '    "what": "no-reply threads",',
    '    "when": "last 7 days",',
    '    "constraints": ["Only threads with no replies", "Timeframe: last 7 days"]',
    '  },',
    '  "provided": {',
    '    "days": 7',
    '  },',
    '  "missing": [],',
    '  "success_criteria": "Polite follow-up drafts are created for all no-reply threads from the last 7 days",',
    '  "confidence": 0.95',
    '}',
    '',
    '// User: "Post to LinkedIn about our new feature"',
    '{',
    '  "outcome": "Create and publish a LinkedIn post about a new feature",',
    '  "context": {',
    '    "where": "LinkedIn",',
    '    "what": "post about new feature"',
    '  },',
    '  "provided": {',
    '    "platform": "linkedin",',
    '    "topic": "new feature"',
    '  },',
    '  "missing": [',
    '    { "key": "content", "question": "What should the post say?", "type": "text", "required": true }',
    '  ],',
    '  "confidence": 0.8',
    '}',
  ].join('\n');
}

/**
 * User prompt for goal extraction
 */
function buildGoalUserPrompt(userInput: string, answers: Record<string, unknown>, meta: { timezone: string; todayISO: string }): string {
  const parts = [
    '**User request:**',
    userInput,
    '',
    '**Context:**',
    `- Current time: ${meta.todayISO}`,
    `- Timezone: ${meta.timezone}`,
  ];

  if (Object.keys(answers).length > 0) {
    parts.push('', '**Previously provided answers:**', JSON.stringify(answers, null, 2));
  }

  parts.push('', '**Task:** Extract the goal and context from this request. Output JSON only.');

  return parts.join('\n');
}

/**
 * Goal extraction node factory
 */
export const makeExtractGoal = (llm: LLM): Node<RunState> => {
  return async (s) => {
    const userPrompt = s.input.prompt ?? s.input.messages?.map((m) => m.content).join('\n') ?? '';

    if (!userPrompt.trim()) {
      return {
        scratch: {
          ...s.scratch,
          goal: {
            outcome: 'No input provided',
            confidence: 0,
            provided: {},
            missing: [{ key: 'prompt', question: 'What would you like me to do?', type: 'text', required: true }],
          },
        },
      };
    }

    const answers = (s.scratch?.answers ?? {}) as Record<string, unknown>;
    const todayISO = (s.ctx.now instanceof Date ? s.ctx.now : new Date()).toISOString();
    const tz = s.ctx.tz || 'UTC';

    const system = buildGoalExtractionPrompt();
    const user = buildGoalUserPrompt(userPrompt, answers, { timezone: tz, todayISO });

    try {
      const raw = await llm.text({
        system,
        user,
        temperature: 0,
        maxTokens: 800,
        timeoutMs: 12_000,
      });

      // Extract JSON safely
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      const json = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
      const parsed = GoalSchema.parse(JSON.parse(json));

      console.log('[extractGoal] LLM returned:', JSON.stringify(parsed, null, 2));
      console.log('[extractGoal] missing fields:', parsed.missing);

      return {
        scratch: {
          ...s.scratch,
          goal: parsed,
        },
      };
    } catch (e) {
      console.warn('[agent.extractGoal] Failed to extract goal; using fallback', {
        runId: s.ctx?.runId,
        error: e instanceof Error ? e.message : String(e),
      });

      // Fallback: treat as general assistance request
      return {
        scratch: {
          ...s.scratch,
          goal: {
            outcome: userPrompt.slice(0, 100),
            confidence: 0.5,
            provided: { prompt: userPrompt },
            missing: [],
          },
        },
      };
    }
  };
};
