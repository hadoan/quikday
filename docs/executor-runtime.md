# Executor Step Runtime

This document explains how the executor runs planned steps: placeholder resolution, array expansion, high‑risk approval, queuing, retries, event emission, and result handling.

- Entry in graph: `confirm → executor → summarize` (packages/agent/buildMainGraph.ts:85). If `confirm` pauses for inputs, the graph halts; otherwise it transitions to `executor`.
- Implementation: packages/agent/nodes/executor.ts:309.

## Step Lifecycle

- Initialize
  - Copies plan into a queue; tracks processed step IDs; holds `stepResults` for placeholder resolution.
  - Reads `ctx.meta.approvedSteps?: string[]` to know which high‑risk steps are allowed.

- Expand and resolve
  - Array expansion: `$step-XX.arrayField[*].subField?` expands one step per array item (packages/agent/nodes/executor.ts:240).
  - Placeholder resolution: `$step-XX.path.to.value` resolves from prior step results (packages/agent/nodes/executor.ts:70).
  - Implicit fan‑out: if args still reference a base step (e.g., `$step-02.*`) and only child results exist (`step-02-0`, `step-02-1`), it fans out one step per child.
  - Merge answers: user answers from `confirm` (`scratch.answers`) override/augment resolved args.
  - Clean args: drops unresolved expansion markers and any `[*]` remnants; errors if plain `$step-XX.*` remain.

- Validate args
  - `chat.respond` is lenient: best‑effort parse against its schema.
  - All other tools validate strictly using their Zod `in` schema; invalid args raise `E_ARGS_INVALID`.

- Approval gate (high‑risk)
  - For non‑chat tools with `risk === 'high'`, executor checks `approvedSteps` and, if not approved, emits `approval.awaiting` and throws `GRAPH_HALT_AWAITING_APPROVAL` to pause (packages/agent/nodes/executor.ts:531,546).
  - Resume by re‑enqueuing the run with `ctx.meta.approvedSteps` containing allowed step IDs.

- Execute
  - chat.respond: runs inline via `registry.call` within `runWithCurrentUser` ALS.
  - Other tools: enqueued to BullMQ `steps` queue; `waitUntilFinished` collects result. If `REDIS_URL` is missing/unavailable, falls back to inline execution (packages/agent/nodes/executor.ts:575–586).
  - Retries: exponential backoff with jitter on transient errors (rate limit, 5xx, timeouts); defaults 3 retries (packages/agent/nodes/executor.ts:35–56, 577–592).

- Emit events
  - `tool.called` (args), `tool.succeeded` (result, ms), `tool.failed` (error), plus `step.executed` for persistence; all include `stepId` for correlation.
  - Before executing each non-chat tool, emits an `assistant.delta` with a simple markdown table of the input parameters so the UI shows inputs pre-execution.
  - chat.respond also emits websocket `assistant.final` so the UI can stream the message.

- Persist results
  - Commits: `{ stepId, result }` appended to `output.commits` and stored in `stepResults` for downstream placeholders.
  - Undo queue: if a tool exposes `undo`, executor derives and enqueues undo actions; published via `undo.enqueued`.

## Placeholders and Expansion

- Simple placeholder: `$step-01.field` resolves to a field from a prior result.
- Array expansion: `$step-01.items[*].id` expands the step into one per item with the `id` substituted.
- Implicit fan‑out: if args still reference a base step (e.g. `$step-02.*`) but only child results exist (like `step-02-0`), executor duplicates the step per child result.
- Any unresolved `$step-XX.*` after expansion/merging causes `E_ARGS_UNRESOLVED` and the run routes to fallback.

## Modes and Inputs

- PREVIEW: planner runs; graph ends without executing.
- APPROVAL: planner runs; graph halts awaiting plan approval; worker resumes from `executor` with `approvedSteps`.
- AUTO: planner → confirm (may ask for missing info) → executor.

Related files
- Graph wiring: packages/agent/buildMainGraph.ts:85
- Executor: packages/agent/nodes/executor.ts:309
- Confirm (missing inputs + plan approvals): packages/agent/nodes/confirm.ts:18
- Events: packages/agent/observability/events.ts:1
- Tool registry (risk, schemas): packages/agent/registry/registry.ts:1

## Operational Notes

- Requires `REDIS_URL` for queued execution; without it, executor uses inline tool calls.
- Enable/disable approval prompts via `AGENT_APPROVALS_ENABLED` or `ctx.meta.approvalsEnabled`.
- Approve specific steps via API by setting `ctx.meta.approvedSteps` when resuming the run.

See also
- docs/step-confirmation-and-queued-execution.md
