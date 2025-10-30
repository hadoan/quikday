type Answers = Record<string, unknown>;

import { INTENTS } from '../nodes/intents';

export function buildClassifyUserPrompt(
  text: string,
  answers: Answers = {},
  meta?: { timezone?: string; todayISO?: string },
): string {
  const intentsCatalog = JSON.stringify(INTENTS, null, 2);

  const answersBlock = Object.keys(answers).length
    ? `\nUser-provided answers (dot-path keys):\n${JSON.stringify(answers, null, 2)}\n`
    : '';

  const metaBlock =
    meta && (meta.timezone || meta.todayISO)
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
  "inputs"?: [ { "key": string, "type": string, "required"?: boolean, "prompt"?: string } ],
  "inputValues"?: { [key: string]: unknown },
  "missingInputs"?: string[]
}

Rules:
- Select the best intent id. If unclear, use "unknown" and omit inputs.
- Derive "inputValues" from the user text and provided answers. Do not guess. Do not include unrelated fields.
- Set "missingInputs" to required input keys that lack values.
- Normalize:
  - For calendar scheduling, invitee_email must be an email address. If you do not have a valid email, leave it missing.
- When resolving relative phrases like "tomorrow 10pm", interpret them in the provided timezone and relative to nowISO.
- Do NOT include extra commentary; strictly output JSON.
- When resolving relative phrases, interpret in the provided timezone (Europe/Berlin) and relative to nowISO.
- Define "next week" as next Monday 00:00:00 to next Sunday 23:59:59  in the provided timezone (Europe/Berlin).
- Prefer local-time ISO (with offset) or include "window_tz":"Europe/Berlin" if using naive local datetimes.
- For scheduling, if the user specifies a number of slots (e.g., "{count=3}" or "3 slots"), set "count" to that number.

`;
}
