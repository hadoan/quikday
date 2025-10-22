import type { Node } from "../runtime/graph";
import type { RunState } from "../state/types";
import type { LLM } from "../llm/types";
import { redactForLog } from "../guards/redaction";

// Bring in the Json type your redactor uses
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Convert unknown → Json with a conservative JSON clone. */
function toJson(value: unknown): Json {
  try {
    // Drops functions/symbols/undefined and removes cycles.
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return null;
  }
}

/**
 * Summarize with a sanitized projection so PII (emails, tokens) doesn't leak.
 */
export const summarize = (llm: LLM): Node<RunState> => {
  return async (s) => {
    // Build a JSON-safe projection
    const commits = (s.output?.commits ?? []).map((c) => ({
      stepId: String(c.stepId),
      result: toJson(c.result),
    })) as Json;

    const diff = toJson(s.output?.diff ?? {});

    // Projection typed as Json so redactForLog() is happy
    const projection: Json = { commits, diff };

    const safe = redactForLog(projection);

    const text = await llm.text({
      system:
        "Summarize succinctly in under 2 sentences. Do not reveal emails or secrets. If channels exist, mention them (e.g., #general).",
      user: JSON.stringify(safe),
      maxTokens: 180,
      temperature: 0.2,
    });

    return { output: { ...s.output, summary: text } };
  };
};
