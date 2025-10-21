// import type { Node } from "../runtime/graph.js";
// import type { RunState } from "../state/types.js";
// import { redact } from "../guards/redaction.js";

// export type FallbackReason =
//     | "policy_denied"
//     | "low_confidence"
//     | "missing_info"
//     | "provider_unavailable"
//     | "rate_limited"
//     | "budget_exceeded"
//     | "quiet_hours"
//     | "validation_failed"
//     | "residency_blocked";

// export interface FallbackPayload {
//     reason: FallbackReason;
//     details?: Record<string, unknown>;   // redacted, JSON-safe
//     nextActions?: Array<{
//         label: string;                      // e.g., "Request approval"
//         action: "APPROVE" | "RETRY" | "ASK_INFO" | "SCHEDULE_LATER" | "OPEN_SETTINGS";
//         data?: Record<string, unknown>;
//     }>;
// }

// export const fallback =
//     (payload: FallbackPayload): Node<RunState> =>
//         async (s) => {
//             const safeDetails = redact(payload.details ?? {});
//             const summary = humanizeFallback(payload.reason, safeDetails);

//             return {
//                 output: {
//                     ...s.output,
//                     summary,                   // user-facing message
//                     fallback: { ...payload, details: safeDetails },
//                 },
//                 // Optionally, bump a soft error for telemetry
//                 scratch: {
//                     ...s.scratch,
//                     errors: [
//                         ...(s.scratch?.errors ?? []),
//                         { code: payload.reason, message: summary },
//                     ],
//                 },
//             };
//         };

// // tiny helper to keep UX consistent
// function humanizeFallback(
//     reason: FallbackReason,
//     details: Record<string, unknown>
// ): string {
//     switch (reason) {
//         case "policy_denied":
//             return "This action isn’t allowed by your team policy.";
//         case "low_confidence":
//             return "I’m not confident enough to proceed without review.";
//         case "missing_info":
//             return "I need a bit more info to continue.";
//         case "provider_unavailable":
//             return "The connected service is temporarily unavailable.";
//         case "rate_limited":
//             return "We’ve hit a rate limit. Try again shortly.";
//         case "budget_exceeded":
//             return "Budget or step limits were reached.";
//         case "quiet_hours":
//             return "It’s quiet hours. You can schedule this for later or request approval.";
//         case "validation_failed":
//             return "Some inputs weren’t valid. Please check and try again.";
//         case "residency_blocked":
//             return "This action is blocked by your data residency setting.";
//         default:
//             return "I couldn’t safely continue. Please review the plan.";
//     }
// }

import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';

export const fallback =
  (reason = 'unspecified'): Node<RunState> =>
  async (s) => {
    const summary = 'I couldn’t safely continue. Reason: ' + reason;
    return { output: { ...s.output, summary, fallback: { reason } } };
  };
