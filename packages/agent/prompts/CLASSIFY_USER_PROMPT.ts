type Answers = Record<string, unknown>;

import { INTENTS } from '../nodes/intents';

export function buildClassifyUserPrompt(
  text: string,
  answers: Answers = {},
  meta?: { timezone?: string; todayISO?: string },
): string {
  const intentsCatalog = JSON.stringify(INTENTS, null, 2);

  const answersBlock =
    Object.keys(answers).length
      ? `\nUser-provided answers (dot-path keys):\n${JSON.stringify(answers, null, 2)}\n`
      : '';

  const metaBlock = meta && (meta.timezone || meta.todayISO)
    ? `\nMeta:\n- timezone: ${meta.timezone ?? 'UTC'}\n- nowISO: ${meta.todayISO ?? ''}\n`
    : '';

  return `Classify this user request into ONE intent from the catalog (or "unknown" if not confident).
Then, using the selected intent's inputs, extract input values from the user text.
Only use the user text and provided answers; do NOT invent values. Leave truly missing as missingInputs.

"""
User:
${text}
"""
${answersBlock}
${metaBlock}
"""
Intents catalog (with inputs):
${intentsCatalog}
"""

Output ONLY compact JSON with this exact shape:
{
  "intent": "<one of the intents above or 'unknown'>",
  "confidence": 0..1,
  "reason": "<short>",
  "targets"?: {
    "time"?: { "text"?: string, "iso"?: string, "durationMin"?: number },
    "attendees"?: string[],
    "email"?: { "to"?: string[], "subject"?: string, "threadId"?: string },
    "slack"?: { "channel"?: "#general", "user"?: "@alice" },
    "notion"?: { "db"?: string, "pageTitle"?: string },
    "sheets"?: { "sheet"?: string, "tab"?: string },
    "social"?: { "platform"?: "linkedin"|"twitter", "firstComment"?: string },
    "crm"?: { "system"?: "hubspot"|"close", "contact"?: string },
    "dev"?: { "system"?: "github"|"jira", "repo"?: string, "projectKey"?: string, "assignees"?: string[], "labels"?: string[] }
  },
  "inputs"?: [ { "key": string, "type": string, "required"?: boolean, "prompt"?: string } ],
  "inputValues"?: { [key: string]: unknown },
  "missingInputs"?: string[]
}

Rules:
- Select the best intent id. If unclear, use "unknown" and omit inputs.
- Set "inputs" to the inputs array of the selected intent (copied from the catalog).
- Derive "inputValues" from the user text and provided answers. Do not guess.
- Set "missingInputs" to required input keys that lack values.
- Normalize:
  - Slack channels must start with "#".
  - "email.to" and "attendees" should be arrays of strings.
  - If you have start+end, you may set targets.time.iso to an ISO range string
    (e.g., "2025-11-02T09:00:00Z/2025-11-02T09:30:00Z").
- When resolving relative phrases like "tomorrow 10pm", interpret them in the provided timezone and relative to nowISO.
- Do NOT include extra commentary; strictly output JSON.
`;
}
