import type { Node } from "../runtime/graph";
import type { RunState, PlanStep } from "../state/types";
import { events } from "../observability/events";

/**
 * Simple ID helper for steps.
 */
function sid(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(2, "0")}`;
}

/**
 * Produce a JSON-safe clone for events/diffs (prevents "[Circular]").
 */
function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const planner: Node<RunState> = async (s) => {
  const steps: PlanStep[] = [];
  const intent = s.scratch?.intent;
  const slackTarget = (s.scratch?.intentMeta as any)?.targets?.slack as
    | { channel?: string; missing?: string[] }
    | undefined;

  // --- 1) Calendar scheduling plan (keep your current logic here) ---
  if (intent === "calendar.schedule") {
    // You can replace this with your real tool & parsed time.
    // If you still need NOOP for dry runs, keep as-is for now.
    steps.push({
      id: sid("step", steps.length + 1),
      tool: "calendar.createEvent", // ← switch from "noop" once your registry has it
      args: {
        title: "Online call",
        start: "2025-10-22T22:00:00Z", // demo; plug in your parsed time
        end: "2025-10-22T22:30:00Z",
        attendees: [], // fill from entity extraction if available
      },
      risk: "low",
    });
  }

  // --- 2) Append Slack if classifier found a channel ---
  if (slackTarget?.channel) {
    steps.push({
      id: sid("step", steps.length + 1),
      tool: "slack.postMessage",
      args: {
        channel: slackTarget.channel, // e.g. "#general"
        text:
          "Created meeting “Online call” for tomorrow 10:00 PM. I’ll DM the calendar link.", // adapt later with real times/links
      },
      risk: "low",
    });
  }

  // If Slack was requested but channel missing, you can:
  // - set an ask-back route, or
  // - leave a hint in output.diff so the UI can prompt the user.
  if (slackTarget && !slackTarget.channel) {
    // optional: record a non-blocking hint
    s.scratch = {
      ...s.scratch,
      errors: [
        ...(s.scratch?.errors ?? []),
        { code: "MISSING_SLACK_CHANNEL", message: "Please specify a Slack channel (e.g., #general)." },
      ],
    };
  }

  // If you still want the original two NOOP steps during migration/testing,
  // keep them (comment out after you wire real tools):
  if (steps.length === 0) {
    steps.push(
      {
        id: sid("step", 1),
        tool: "noop",
        args: { prompt: s.input.prompt ?? "", action: "check_calendar" },
        risk: "low",
      },
      {
        id: sid("step", 2),
        tool: "noop",
        args: { prompt: s.input.prompt ?? "", action: "create_event" },
        risk: "low",
      }
    );
  }

  // --- 3) Build a compact, JSON-safe diff (no circular refs) ---
  const diff = jsonSafe({
    summary: `Proposed actions: ${steps.map((x) => x.tool.split(".").pop()).join(", ")}`,
    steps: steps.map((x) => ({ id: x.id, tool: x.tool })), // keep minimal for logs
  });

  // Emit plan preview (already JSON safe)
  events.planReady(s, jsonSafe(steps), diff);

  return {
    scratch: { ...s.scratch, plan: steps },
    output: { ...s.output, diff },
  };
};
