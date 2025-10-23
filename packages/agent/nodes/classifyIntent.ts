import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import type { LLM } from '../llm/types';
import { z } from 'zod';
import { INTENTS, type IntentId } from './intents';

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
});
type LlmOutType = z.infer<typeof LlmOut>;

// ---------------- Heuristic fallback (tiny, fast) -----------------------------
function heuristic(text: string): LlmOutType {
  const t = text.toLowerCase();

  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const channel = t.match(/(^|\s)#([a-z0-9_\-]+)/i)?.[2]
    ? `#${t.match(/(^|\s)#([a-z0-9_\-]+)/i)![2]}`
    : undefined;

  let intent: IntentId | 'unknown' = 'unknown';
  if (has('calendar', 'schedule', 'meeting', 'invite', 'reschedule', 'slot'))
    intent = 'calendar.schedule';
  else if (has('draft', 'send', 'email', 'gmail'))
    intent = has('read', 'show', 'search') ? 'email.read' : 'email.send';
  else if (has('slack', 'channel', '#')) intent = 'slack.notify';
  else if (has('notion', 'page', 'database', 'db')) intent = 'notion.upsert';
  else if (has('sheet', 'sheets', 'csv'))
    intent = has('append', 'write', 'log') ? 'sheets.write' : 'sheets.read';
  else if (has('linkedin', 'post', 'schedule on linkedin')) intent = 'linkedin.post';
  else if (has('twitter', 'tweet', 'x.com', 'schedule tweet')) intent = 'twitter.post';
  else if (has('hubspot', 'close.com', 'crm', 'contact')) intent = 'crm.upsert';
  else if (has('github', 'repo', 'issue')) intent = 'github.create_issue';
  else if (has('jira', 'project', 'issue')) intent = 'jira.create_issue';

  return {
    intent,
    confidence: intent === 'unknown' ? 0.4 : 0.85,
    reason: 'Heuristic routing',
    targets: {
      slack: channel ? { channel } : undefined,
    },
  };
}

// ---------------- Prompts -----------------------------------------------------
const SYSTEM = `You are a conservative intent router. 
Pick the single best intent from the provided list, or return "unknown" if not confident.
Extract only lightweight targets needed by a planner (channel, time, attendees, etc.).
Return ONLY compact JSON.`;

function userPrompt(text: string) {
  const menu = INTENTS.map((i) => `- ${i.id}: ${i.desc}`).join('\n');
  return `Classify this user request into ONE intent from the list below (or "unknown" if not confident).
Provide minimal targets/slots only if clearly present.

User:
"""
${text}
"""

Intents:
${menu}

Output JSON:
{
  "intent": "<one of the intents above or 'unknown'>",
  "confidence": 0..1,
  "reason": "<short>",
  "targets": {
    "time"?: { "text"?: string, "iso"?: string, "durationMin"?: number },
    "attendees"?: string[],
    "email"?: { "to"?: string[], "subject"?: string, "threadId"?: string },
    "slack"?: { "channel"?: "#general", "user"?: "@alice" },
    "notion"?: { "db"?: string, "pageTitle"?: string },
    "sheets"?: { "sheet"?: string, "tab"?: string },
    "social"?: { "platform"?: "linkedin"|"twitter", "firstComment"?: string },
    "crm"?: { "system"?: "hubspot"|"close", "contact"?: string },
    "dev"?: { "system"?: "github"|"jira", "repo"?: string, "projectKey"?: string, "assignees"?: string[], "labels"?: string[] }
  }
}`;
}

// ---------------- Factory: LLM DI --------------------------------------------
export const makeClassifyIntent = (llm: LLM): Node<RunState> => {
  return async (s) => {
    const text = s.input.prompt ?? s.input.messages?.map((m) => m.content).join('\n') ?? '';

    if (!text.trim()) {
      return {
        scratch: {
          ...s.scratch,
          intent: 'unknown',
          intentMeta: { confidence: 0, reason: 'empty input' },
        },
      };
    }

    let out: LlmOutType | null = null;

    try {
      const raw = await llm.text({
        system: SYSTEM,
        user: userPrompt(text),
        temperature: 0,
        maxTokens: 220,
        timeoutMs: 12_000,
      });

      // Extract JSON payload safely
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      const json = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
      const parsed = LlmOut.parse(JSON.parse(json));

      // Constrain to allowed intents
      const picked = ALLOWED.has(parsed.intent as IntentId)
        ? (parsed.intent as IntentId)
        : 'unknown';
      out = { ...parsed, intent: picked };
    } catch (e) {
      // swallow and fallback
    }

    if (!out || out.intent === 'unknown') {
      out = heuristic(text);
    }

    // Normalize some common slots/targets for downstream planner
    const targets = out.targets ?? {};
    if (targets.slack?.channel && !targets.slack.channel.startsWith('#')) {
      targets.slack.channel = `#${targets.slack.channel}`;
    }

    // Final write
    return {
      scratch: {
        ...s.scratch,
        intent: ALLOWED.has(out.intent as IntentId) ? out.intent : 'unknown',
        intentMeta: {
          confidence: out.confidence ?? 0.7,
          reason: out.reason,
          targets,
        },
      },
    };
  };
};
