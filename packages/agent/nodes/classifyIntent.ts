import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import type { LLM } from '../llm/types';
import { z } from 'zod';
import { INTENTS, type IntentId, type IntentInput } from './intents';
import { CLASSIFY_SYSTEM } from '../prompts/CLASSIFY_SYSTEM';
import { buildClassifyUserPrompt } from '../prompts/CLASSIFY_USER_PROMPT';

type QaItem = { key: string; question: string; type?: string };
type Answers = Record<string, unknown>;

// IntentId now sourced from ./intents
const ALLOWED = new Set<IntentId>(INTENTS.map((i) => i.id) as IntentId[]);

// ---------------- JSON contract from LLM (flexible, future-proof) ------------
const LlmOut = z.object({
  intent: z.string(), // free string, we’ll constrain to ALLOWED later
  confidence: z.number().min(0).max(1).optional().default(0.7),
  reason: z.string().optional(),
  // Minimal, expandable slots. Keep lean.
  targets: z
    .object({
      time: z
        .object({
          text: z.string().optional(), // "tomorrow 4pm"
          iso: z.string().optional(), // "2025-10-22T16:00:00+02:00"
          durationMin: z.number().optional(),
        })
        .partial()
        .optional(),

      attendees: z.array(z.string()).optional(), // emails/usernames
      email: z
        .object({
          to: z.array(z.string()).optional(),
          subject: z.string().optional(),
          threadId: z.string().optional(),
        })
        .partial()
        .optional(),

      slack: z
        .object({
          channel: z
            .string()
            .regex(/^#?[a-z0-9_\-]+$/i)
            .optional(), // "#general"
          user: z.string().optional(), // "@alice"
        })
        .partial()
        .optional(),

      notion: z
        .object({
          db: z.string().optional(),
          pageTitle: z.string().optional(),
        })
        .partial()
        .optional(),

      sheets: z
        .object({
          sheet: z.string().optional(),
          tab: z.string().optional(),
        })
        .partial()
        .optional(),

      social: z
        .object({
          platform: z.enum(['linkedin', 'twitter']).optional(),
          firstComment: z.string().optional(),
        })
        .partial()
        .optional(),

      crm: z
        .object({
          system: z.enum(['hubspot', 'close']).optional(),
          contact: z.string().optional(),
        })
        .partial()
        .optional(),

      dev: z
        .object({
          system: z.enum(['github', 'jira']).optional(),
          repo: z.string().optional(),
          projectKey: z.string().optional(),
          assignees: z.array(z.string()).optional(),
          labels: z.array(z.string()).optional(),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),

  // New: surface intent input schema and extracted values
  inputs: z
    .array(
      z.object({
        key: z.string(),
        type: z.string(),
        required: z.boolean().optional(),
        prompt: z.string().optional(),
      }),
    )
    .optional(),
  inputValues: z.record(z.string(), z.unknown()).optional(),
  missingInputs: z.array(z.string()).optional(),
});
type LlmOutType = z.infer<typeof LlmOut>;

// ---------------- Prompts -----------------------------------------------------

// user prompt moved to ../prompts/CLASSIFY_USER_PROMPT

// ---------------- Factory: LLM DI --------------------------------------------
export const makeClassifyIntent = (llm: LLM): Node<RunState> => {
  return async (s) => {
    const userPrompt = s.input.prompt ?? s.input.messages?.map((m) => m.content).join('\n') ?? '';

    if (!userPrompt.trim()) {
      return {
        scratch: {
          ...s.scratch,
          intent: 'unknown',
          intentMeta: { confidence: 0, reason: 'empty input' },
        },
      };
    }

    let out: LlmOutType | null = null;
    const answers = (s.scratch?.answers ?? {}) as Record<string, unknown>;
    const todayISO = (s.ctx.now instanceof Date ? s.ctx.now : new Date()).toISOString();
    const tz = s.ctx.tz || 'UTC';
    const prompt = buildClassifyUserPrompt(userPrompt, answers, { timezone: tz, todayISO });

    try {
      const raw = await llm.text({
        system: CLASSIFY_SYSTEM,
        user: prompt,
        temperature: 0,
        maxTokens: 220,
        timeoutMs: 12_000,
      });

      // Extract JSON payload safely
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      const json = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
      const parsed = LlmOut.parse(JSON.parse(json));

      // // Constrain to allowed intents
      // const picked = ALLOWED.has(parsed.intent as IntentId)
      //   ? (parsed.intent as IntentId)
      //   : 'unknown';
      out = { ...parsed, intent: parsed.intent };
    } catch (e) {
      // swallow and fallback

      console.warn('[agent.classifyIntent] LLM classification failed; fallback to unknown', {
        runId: s.ctx?.runId,
        error: e instanceof Error ? e.message : String(e),
      });

    }

    // Normalize some common slots/targets for downstream planner
    if (!out) {
      out = {
        intent: 'unknown',
        confidence: 0,
        reason: 'llm_error',
        targets: {},
      } as LlmOutType;
    }
    const targets = out.targets ?? {};
    if (targets.slack?.channel && !targets.slack.channel.startsWith('#')) {
      targets.slack.channel = `#${targets.slack.channel}`;
    }

    // Map intent to INTENTS catalog. Rely on LLM for extraction; only fill schema if missing.
    const pickedIntent = ALLOWED.has(out.intent as IntentId) ? (out.intent as IntentId) : 'unknown';
    const intentDef = INTENTS.find((i) => i.id === pickedIntent) as (import('./intents').Intent | undefined);
    const llmInputs = out.inputs as ReadonlyArray<IntentInput> | undefined;
    const llmInputValues = out.inputValues as Record<string, unknown> | undefined;
    if (!llmInputs && intentDef?.inputs) {
      out.inputs = [...intentDef.inputs];
    }
    if (!out.missingInputs && out.inputs) {
      const inputs = out.inputs as ReadonlyArray<IntentInput>;
      const values = llmInputValues || {};
      const missing = inputs
        .filter((i) => i.required)
        .map((i) => i.key)
        .filter((k) => {
          const v = (values)[k];
          if (v === undefined || v === null) return true;
          if (Array.isArray(v)) return v.length === 0;
          if (typeof v === 'string') return v.trim().length === 0;
          return false;
        });
      out.missingInputs = missing;
    }

    // Final write
    return {
      scratch: {
        ...s.scratch,
        intent: out.intent,
        intentMeta: {
          confidence: out.confidence ?? 0.7,
          reason: out.reason,
          targets,
          inputs: out.inputs,
          inputValues: out.inputValues,
          missingInputs: out.missingInputs,
        },
      },
    };
  };
};
