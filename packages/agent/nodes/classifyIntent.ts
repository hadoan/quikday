import type { Node } from "../runtime/graph";
import type { RunState } from "../state/types";
import type { LLM } from "../llm/types";
import { z } from "zod";

// ── JSON contract the LLM must return ─────────────────────────────────────────
const Out = z.object({
  intent: z.enum(["calendar.schedule", "slack.notify", "unknown"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  targets: z
    .object({
      slack: z
        .object({
          channel: z.string().regex(/^#?[a-z0-9_-]+$/i).optional(),
          missing: z.array(z.literal("channel")).optional(),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),
});
type LlmOut = z.infer<typeof Out>;

// ── Minimal heuristic fallback if LLM fails ───────────────────────────────────
function heuristic(text: string): LlmOut {
  const wantsCalendar = /\b(calendar|schedule|meeting|invite)\b/i.test(text);
  const mentionsSlack = /\bslack\b/i.test(text) || /#\w+/.test(text);
  const channelHash = text.match(/(^|\s)#([a-z0-9_-]+)/i)?.[2];
  const channelPhrase =
    text.match(/\b(?:in|to)\s+channel\s+#?([a-z0-9_-]+)/i)?.[1] ??
    text.match(/\b(?:to|in)\s+#?([a-z0-9_-]+)/i)?.[1];
  const channel = channelHash ? `#${channelHash}` : channelPhrase ? `#${channelPhrase}` : undefined;

  const intent = wantsCalendar ? "calendar.schedule" : mentionsSlack ? "slack.notify" : "unknown";
  const targets = mentionsSlack ? { slack: channel ? { channel } : { missing: ["channel" as const] } } : undefined;

  return {
    intent,
    confidence: intent === "unknown" ? 0.4 : (mentionsSlack && !channel) ? 0.75 : 0.9,
    reason:
      intent === "unknown"
        ? "No strong scheduling or Slack cues detected"
        : mentionsSlack && !channel
          ? "Slack requested but channel unspecified"
          : "Clear lexical cues",
    targets,
  };
}

// ── Prompt used for the classifier ────────────────────────────────────────────
const SYSTEM = `You are a classification router for an AI assistant. 
Return ONLY compact JSON that matches the schema.
Infer intent and targets conservatively. 
If unsure, choose "unknown" and lower confidence.`;

function userPrompt(text: string) {
  return `Classify the user request.

User text:
"""
${text}
"""

Valid intents: "calendar.schedule", "slack.notify", "unknown".

Targets:
- For Slack, detect { "slack": { "channel": "#general" } } if a #channel is present.
- If Slack is requested but no channel is given, return { "slack": { "missing": ["channel"] } }.

Output JSON fields:
{ "intent": <string>, "confidence": <0..1>, "reason": <string>, "targets": { "slack"?: { "channel"?: <string>, "missing"?: ["channel"] } } }`;
}

// ── Factory: inject LLM (DI) ─────────────────────────────────────────────────
export const makeClassifyIntent = (llm: LLM): Node<RunState> => {
  return async (s) => {
    const text =
      s.input.prompt ??
      s.input.messages?.map((m) => m.content).join("\n") ??
      "";

    // Fast-path: empty input → unknown
    if (!text.trim()) {
      console.log(`[classifyIntent] run=${s.ctx.runId} Empty input, returning unknown`);
      return {
        scratch: {
          ...s.scratch,
          intent: "unknown",
          intentMeta: { confidence: 0.0, reason: "empty input" },
        },
      };
    }

    // Call LLM
    let parsed: LlmOut | null = null;
    try {
      console.log(`[classifyIntent] run=${s.ctx.runId} Calling LLM for classification (input length: ${text.length})`);
      
      const jsonStr = await llm.text({
        system: SYSTEM,
        user: userPrompt(text),
        temperature: 0.0,
        maxTokens: 220,
        timeoutMs: 12_000,
      });

      // Be resilient to accidental backticks or prose
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      const justJson = firstBrace >= 0 && lastBrace > firstBrace ? jsonStr.slice(firstBrace, lastBrace + 1) : jsonStr;
      const raw = JSON.parse(justJson);
      parsed = Out.parse(raw);

      console.log(`[classifyIntent] run=${s.ctx.runId} LLM parsing successful`);
    } catch (error) {
      console.log(`[classifyIntent] run=${s.ctx.runId} LLM failed, falling back to heuristic: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Confidence threshold & fallback
    const out = parsed && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed : heuristic(text);

    const result = {
      intent: out.intent,
      confidence: out.confidence,
      reason: out.reason,
      targets: out.targets,
    };

    console.log(`[classifyIntent] run=${s.ctx.runId} Classification complete: ${out.intent} (confidence: ${out.confidence})`);

    return {
      scratch: {
        ...s.scratch,
        intent: out.intent,
        intentMeta: {
          confidence: out.confidence,
          reason: out.reason,
          targets: out.targets,
        },
      },
    };
  };
};