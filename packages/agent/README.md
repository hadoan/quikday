**Agent Graph Overview**

- Purpose: Orchestrates an LLM-driven workflow to classify intent, collect any missing inputs, plan tool calls, execute them, and summarize results.
- Runtime: A lightweight directed graph with typed nodes and shallow state merges.

**State Model**

- scratch: Ephemeral working memory used by nodes to coordinate logic.
  - Keys: `intent`, `intentMeta`, `plan`, `awaiting`, etc.
  - Missing-input flow: `intentMeta.inputs`, `intentMeta.inputValues`, `intentMeta.missingInputs` (populated by classify).
- output: User-facing result that the API/UI consume and persist.
  - Keys: `summary`, `diff`, `commits`, `undo`, and `awaiting` for input prompts.
- Files: packages/agent/state/types.ts

**Graph Flow**

- Build: packages/agent/buildMainGraph.ts
- Nodes:
  - classify → planner → confirm → executor → summarize → END
  - fallback is used when errors occur in executor.
- Edges (simplified):
  - START → `classify`
  - `classify` → `planner`
  - `planner` → `confirm`
  - `confirm` → `END` if `scratch.awaiting` is set; otherwise `executor`
  - `executor` → `fallback` on error; else `summarize`
  - `summarize` → END

**Nodes**

- classifyIntent: packages/agent/nodes/classifyIntent.ts
  - Calls LLM with the intents catalog and user text.
  - Sets `scratch.intent` and `scratch.intentMeta`.
  - intentMeta includes: `targets`, `inputs`, `inputValues`, `missingInputs`.

- planner: packages/agent/nodes/planner.ts
  - Asks LLM to draft tool `steps` only (no longer returns questions/inputs).
  - Post-processes steps (filter allowed tools, assign ids/risk/dependsOn).
  - Writes steps to `scratch.plan` and a minimal `output.diff` summary.

- confirm: packages/agent/nodes/confirm.ts
  - Reads `scratch.intentMeta.missingInputs` and `scratch.intentMeta.inputs`.
  - Builds typed questions for unresolved required inputs and sets:
    - `scratch.awaiting = { reason: 'missing_info', questions, ts }`
    - `output.awaiting = { reason: 'missing_info', questions, ts }`
  - Emits `awaiting.input` event and returns, causing the graph to end on this pass.
  - If nothing is missing, routes onward to `executor`.

- executor: packages/agent/nodes/executor.ts
  - Runs each step in `scratch.plan` via the registry with retries.
  - Emits tool events, collects `commits`, and optional `undo` actions.
  - On failure, sets `state.error` for routing to `fallback`.

- summarize: packages/agent/nodes/summarize.ts
  - Produces a short, user-facing `output.summary` from commits/diff.

- fallback: packages/agent/nodes/fallback.ts
  - Provides a minimal failure summary and ends the graph.

**Awaiting Input Loop**

- On first pass, `confirm` may set `awaiting` and end the run.
- The API persists `run.output.awaiting` and exposes questions to the UI.
- When the user answers, the backend merges answers and clears awaiting:
  - apps/api/src/runs/runs.service.ts: `applyUserAnswers()`
    - Updates `run.output.scratch.answers`, clears `awaiting`, and persists.
  - apps/api/src/queue/run.processor.ts rebuilds `RunState` on resume by merging persisted `output.scratch` back into `state.scratch`.

**Events**

- Publisher: packages/agent/observability/events.ts
- Notable event types: `plan_generated`, `tool.called`, `tool.succeeded`, `tool.failed`, `awaiting.input`, `run_completed`.
- The graph wires hooks to emit `node.enter`, `node.exit`, and `edge.taken`.

**Routing & Approvals**

- Edges are declared in packages/agent/buildMainGraph.ts.
- Approval checks live in packages/agent/guards/policy.ts and are evaluated in `confirm` after input collection.

**Persistence**

- Prisma model `run.output` stores the latest user-visible output and errors.
- The worker strips `scratch` from `run.output` when restoring initial state but merges any `output.scratch` into `state.scratch` for continuity (answers, etc.).

**Extending The Graph**

- Add a node: implement `Node<RunState>` and register via `buildMainGraph.ts`.
- Add tools: register in packages/agent/registry/registry.ts; expose `undo` if applicable.
- Add an app integration: implement service in packages/appstore/\* and provide a tool wrapper in the registry.
