# Step Confirmation & Queued Execution

This feature adds per-plan step IDs, per-step confirmation for high‑risk tools, and a dedicated queue that executes steps outside the main run loop. It improves traceability (step ↔ DB rows), safety (explicit approval for risky actions), and scalability (isolated step workers).

## TL;DR

- Persist planner step IDs into the `Step` table (`planStepId`) and mark risky steps (`waitingConfirm`).
- Block execution of high‑risk steps until the user approves specific plan steps.
- Enqueue normal steps to a new BullMQ queue (`steps`) and await results; falls back to inline execution if Redis is unavailable.
- Frontend shows mid‑run approvals and can resume execution with only the approved steps.

---

## Data Model

Prisma model `Step` now includes:

```prisma
model Step {
  id              Int       @id @default(autoincrement())
  runId           String
  tool            String
  action          String
  appId           String?
  credentialId    Int?
  request         Json?
  response        Json?
  errorCode       String?
  planStepId      String?   // executor/planner id, e.g. "step-02-0"
  waitingConfirm  Boolean   @default(false) // true if step required explicit approval
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  Run             Run       @relation(fields: [runId], references: [id])
}
```

Migration: `pnpm db:migrate` (or `pnpm db:push` for dev).

---

## Backend Flow

### Planning → Persistence

- Planner writes a plan with step IDs (`step.id`, e.g., `step-01`, `step-02-0`).
- `StepsService.createPlannedSteps` persists planned steps with:
  - `planStepId = step.id`
  - `waitingConfirm = (registry.get(step.tool).risk === 'high')`
  - `request = step.args`
- File: `apps/api/src/runs/steps.service.ts`

### Executor

- Resolves `$step-XX.*` placeholders and performs array fan‑out to concrete steps (`step-02-0`, `step-02-1`, ...).
- High‑risk gating: before calling a non‑chat tool with `risk === 'high'`:
  - Emits an approval event and halts the graph with `GRAPH_HALT_AWAITING_APPROVAL`.
  - Worker marks the run `awaiting_approval` and publishes step details to the UI.
- Approved resumption:
  - When resuming with `ctx.meta.approvedSteps: string[]`, executor runs only those `planStepId`s.
- Step execution path:
  - Non‑chat tools are enqueued to `steps` queue and awaited via `job.waitUntilFinished`.
  - If `REDIS_URL` is missing/unavailable, executor falls back to direct inline `registry.call`.
- File: `packages/agent/nodes/executor.ts`

### Step Queue

- New BullMQ queue `steps` with processor `StepRunProcessor`:
  - Executes a single tool with ALS user context.
  - Returns the tool result and duration.
- Files:
  - `apps/api/src/queue/queue.module.ts` (registers `steps` queue)
  - `apps/api/src/queue/step-run.processor.ts`

### Event → Log → Step rows

- Executor includes `stepId` in `tool.called/succeeded/failed` events.
- Worker’s graph event handler copies `stepId` into step logs (`planStepId`), which `StepsService.createExecutedSteps` persists.
- Files:
  - `apps/api/src/queue/create-graph-event-handler.ts`
  - `apps/api/src/runs/steps.service.ts`

### Approvals API

- Awaiting approval event (worker → UI):
  - Type: `run_status`
  - Payload: `{ status: 'awaiting_approval', steps: Array<{ id, tool, args? }> }`
- Approve steps:
  - `POST /runs/:id/approve` with `{ approvedSteps: string[] }` (planner/executor IDs)
  - Marks run `approved`, sets `config.resumeFrom = 'executor'`, re‑enqueues run; executor filters to approved steps.
- Confirm missing inputs:
  - `POST /runs/:id/confirm` with `{ answers }`
  - Persists answers, clears awaiting, and re‑enqueues.
- Files:
  - `apps/api/src/runs/runs.controller.ts`
  - `apps/api/src/runs/runs.service.ts`

### Configuration

- `REDIS_URL` — required for step queue; without it, executor uses inline execution.
- `AGENT_APPROVALS_ENABLED=true` — enables confirm node’s input approval gate; high‑risk step gating in executor is independent.

---

## Frontend Behavior

### Rendering approvals

- On `plan_generated`, the chat shows a `PlanCard` summarizing steps.
- If a later `run_status` includes `{ status: 'awaiting_approval', steps }`, the chat injects another `PlanCard` for mid‑run approvals.
- Approve button triggers `POST /runs/:id/approve` with selected step IDs; Cancel calls `/runs/:id/cancel`.
- Files:
  - `apps/web/src/pages/Index.tsx` (inject plan for mid‑run approvals)
  - `apps/web/src/components/chat/ChatStream.tsx` (approve/cancel actions on PlanCard)
  - `apps/web/src/lib/datasources/ApiDataSource.ts` (approve/cancel API)

### Awaiting user inputs

- When `run_status` has `{ status: 'awaiting_input', questions }`, UI shows `QuestionsPanel` and posts answers to `/runs/:id/confirm`.
- File: `apps/web/src/components/QuestionsPanel.tsx`

### Step list & logs

- UI step list shows planned and executed steps; executed steps reflect request/response and status.
- `planStepId` allows correlating plan entries to execution logs (available in backend; UI may add badges later).

---

## End-to-End

1. User submits prompt → planner emits plan → planned steps persisted with `planStepId` and `waitingConfirm`.
2. Executor starts; if a high‑risk step is next and not approved → emit `awaiting_approval` and halt.
3. UI shows approval card with steps; user approves → backend enqueues run with `approvedSteps`.
4. Executor resumes and executes only approved steps (queued per‑step); results and logs stream to UI.
5. Run summarizes and completes.

---

## Developer Pointers

- Tool risk metadata: `packages/agent/registry/types.ts` and registrations in `packages/agent/registry/registry.ts`.
- Queue integration: `apps/api/src/queue/*`.
- Event wiring: `packages/agent/observability/events.ts` → `apps/api/src/queue/create-graph-event-handler.ts`.
- Persistence helpers: `apps/api/src/runs/steps.service.ts`.
- Graph construction: `packages/agent/buildMainGraph.ts` (nodes, edges).

---

## Troubleshooting

- pnpm build fails at Corepack shim → upgrade Node (>= 18/20) and re‑enable Corepack: `corepack enable && corepack prepare pnpm@9.12.3 --activate`.
- Step queue not processing → check `REDIS_URL`, and that `StepRunProcessor` is registered (`apps/api/src/queue/queue.module.ts`).
- Approvals not appearing → ensure executor hit a high‑risk tool without `approvedSteps`, and the worker propagated `awaiting_approval` with `steps`.
