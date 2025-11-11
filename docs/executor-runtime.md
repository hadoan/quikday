# Executor Runtime (Map-style, explicit expansion)

This document explains how the executor runs planned steps using explicit map expansion and named variables: variable binding, `$var`/`$each` resolution, high‑risk approvals, queueing, retries, events, and persistence.

- Graph entry: `confirm → executor → summarize` (packages/agent/buildMainGraph.ts)
- Implementation is split by concern:
  - Wrapper: packages/agent/nodes/executor.ts
  - Placeholders/vars: packages/agent/nodes/executor/placeholders.ts
  - Expansion (Map): packages/agent/nodes/executor/expand.ts
  - Queue: packages/agent/nodes/executor/queue.ts
  - Utils (retry, logging): packages/agent/nodes/executor/utils.ts

## Step Lifecycle

- Initialize
  - Copy plan into a work queue; initialize `stepResults` map for downstream references.
  - Read `ctx.meta.approvedSteps?: string[]` to gate high‑risk tools.

- Resolve + Expand (explicit)
  - Variables: `$var.*` resolve from `scratch.vars` (populated via `binds`).
  - Map expansion: steps may declare `expandOn: '$var.items'` to run once per item.
  - Per‑item context: `$each.*`, `$index`, `$key` (from optional `expandKey`).
  - Merge answers: user answers from `confirm` (`scratch.answers`) overlay resolved args.
  - Clean args: drop unresolved expansion markers; error on unresolved placeholders.

- Validate
  - `chat.respond`: lenient (best‑effort schema parse).
  - Other tools: strict Zod validation; invalid args raise `E_ARGS_INVALID`.

- Approval gate (high‑risk)
  - If `risk === 'high'` and not pre‑approved via `ctx.meta.approvedSteps`, emit `approval.awaiting` and throw `GRAPH_HALT_AWAITING_APPROVAL`.

- Execute (queue only)
  - All non‑chat tools enqueue to BullMQ `steps` queue; wait for completion.
  - Queue is required. If missing, throws `E_QUEUE_UNAVAILABLE` (no inline fallback).
  - Retries: exponential backoff with jitter on transient errors (3 attempts).

- Emit events
  - `tool.called`, `assistant.delta` (input table), `tool.succeeded`, `tool.failed`, `step.executed`.
  - `chat.respond` also emits websocket `assistant.final`.

- Persist + binds
  - Save commit `{ stepId, result }`; store in `stepResults`.
  - Binds: if a step provides `binds: { name: selector }`, evaluate `$`, `$.path`, `$var.path` and store in `scratch.vars[name]`.
  - Update `plan[*].hasOutput` with a heuristic to aid dependency gating.

## Placeholders and Expansion

Supported

- `$var.path` — read from named variables (working memory).
- `$each.path` — read from current item in a mapped step.
- `$index` and `$key` inside strings for mapped steps.

Not supported

- `$step-XX.*` — removed. Use `binds` + `$var.*`.
- Legacy `[*]` array syntax — removed. Use `expandOn + $each`.

Explicit Map Expansion

- `expandOn: '$var.items'` — resolves to an array; executor creates `step-XX-0`, `step-XX-1`, …
- `expandKey: '$each.id'` — optional; exposes `$key` and enables stable identity.
- Inside mapped steps:
  - Direct: `to: '$each.from.address'`
  - Embedded: `subject: 'Re: $each.subject (#$index)'`

Args Cleanup and Errors

- Unresolved placeholders after resolution cause `E_ARGS_UNRESOLVED`.
- Strings containing leftover expansion markers are dropped before schema parse.

## Modes and Inputs

- PREVIEW: planner runs; graph ends without executing.
- APPROVAL: planner runs; graph halts awaiting plan approval; worker resumes from `executor` with `approvedSteps`.
- AUTO: planner → confirm (may ask for missing info) → executor.

## Related Files

- Graph wiring: packages/agent/buildMainGraph.ts
- Executor wrapper: packages/agent/nodes/executor.ts
- Placeholders/vars: packages/agent/nodes/executor/placeholders.ts
- Expansion (Map): packages/agent/nodes/executor/expand.ts
- Queue: packages/agent/nodes/executor/queue.ts
- Events: packages/agent/observability/events.ts
- Tool registry: packages/agent/registry/registry.ts

## Operational Notes

- Requires `REDIS_URL` for queued execution; there is no inline fallback.
- Enable/disable approval prompts via `AGENT_APPROVALS_ENABLED` or `ctx.meta.approvalsEnabled`.
- Approve specific steps via API by setting `ctx.meta.approvedSteps` when resuming the run.
