**Agent Graph Overview**

- Purpose: Orchestrates an LLM-driven workflow to extract user goals, identify missing inputs based on tool schemas, plan tool calls, execute them, and summarize results.
- Runtime: A lightweight directed graph with typed nodes and shallow state merges.

**State Model**

- scratch: Ephemeral working memory used by nodes to coordinate logic.
  - Keys: `goal`, `plan`, `awaiting`, `answers`, etc.
  - Goal-oriented flow: `goal.outcome`, `goal.provided`, `goal.missing` (extracted by extractGoal, validated by planner).
- output: User-facing result that the API/UI consume and persist.
  - Keys: `summary`, `diff`, `commits`, `undo`, and `awaiting` for input prompts.
- Files: packages/agent/state/types.ts

**Graph Flow**

- Build: packages/agent/buildMainGraph.ts
- Nodes:
  - extractGoal → planner → [ensure_inputs] → confirm → executor → summarize → END
  - fallback is used when errors occur in executor.
- Edges (simplified):
  - START → `extractGoal`
  - `extractGoal` → `planner`
  - `planner` → `ensure_inputs` if missing required inputs; else proceeds based on mode
  - `planner` → `confirm` (AUTO mode with complete inputs)
  - `planner` → `END` (PREVIEW or APPROVAL mode)
  - `ensure_inputs` → `END` if `scratch.awaiting` is set; else `planner` (re-plan with answers)
  - `confirm` → `END` if `scratch.awaiting` is set; else `executor`
  - `executor` → `fallback` on error; else `summarize`
  - `summarize` → END

**Nodes**

- extractGoal: packages/agent/nodes/extractGoal.js
  - Uses LLM with modular prompt system and domain-specific rules.
  - Extracts user's goal, context, and basic provided information.
  - Sets `scratch.goal` with outcome, confidence, provided data, and basic missing fields.
  - Does NOT perform deep validation - that's handled by planner.

- planner: packages/agent/nodes/planner.ts
  - Asks LLM to draft tool `steps` based on the extracted goal.
  - Uses LLM-based intelligent detection to identify missing required inputs:
    - Reads tool `in` schemas from registry (Zod schemas with required/optional params).
    - Sends user message, provided info, and tool requirements to LLM.
    - LLM contextually determines which parameters are truly missing.
    - Generates natural language questions with appropriate types.
  - Post-processes steps (filter allowed tools, assign ids/risk/dependsOn).
  - If missing required inputs detected, updates `goal.missing` and pauses for input.
  - Writes steps to `scratch.plan` and a minimal `output.diff` summary.

- ensure_inputs: packages/agent/nodes/ensureInputs.ts
  - Validates that all required inputs from `goal.missing` are answered.
  - If unresolved required inputs remain, builds typed questions and sets:
    - `scratch.awaiting = { reason: 'missing_info', questions, ts }`
    - `output.awaiting = { reason: 'missing_info', questions, ts }`
  - Emits `awaiting.input` event and ends the graph.
  - Once answers provided, flow returns to `planner` for re-validation with tool schemas.

- confirm: packages/agent/nodes/confirm.ts
  - Performs final confirmation checks before execution.
  - Can set `scratch.awaiting` if additional confirmation needed.
  - If no issues, routes to `executor`.

- executor: packages/agent/nodes/executor.ts
  - Runs each step in `scratch.plan` via the registry with retries.
  - Emits tool events, collects `commits`, and optional `undo` actions.
  - On failure, sets `state.error` for routing to `fallback`.

- summarize: packages/agent/nodes/summarize.ts
  - Produces a short, user-facing `output.summary` from commits/diff.

- fallback: packages/agent/nodes/fallback.ts
  - Provides a minimal failure summary and ends the graph.

**Awaiting Input Loop**

- On first pass, `planner` may detect missing inputs via LLM analysis and end the run.
- `ensure_inputs` validates answers and may set `awaiting` if inputs incomplete.
- The API persists `run.output.awaiting` and exposes questions to the UI.
- When the user answers, the backend merges answers and clears awaiting:
  - apps/api/src/runs/runs.service.ts: `applyUserAnswers()`
    - Updates `run.output.scratch.answers`, clears `awaiting`, and persists.
  - apps/api/src/queue/run.processor.ts rebuilds `RunState` on resume by merging persisted `output.scratch` back into `state.scratch`.
- Flow returns to `planner` to re-validate with new answers against tool schemas.

**Missing Inputs Detection**

- Location: packages/agent/nodes/planner.ts (function `detectMissingInputsWithLLM`)
- Method: LLM-based intelligent detection
- Prompts: packages/agent/prompts/MISSING_INPUTS_SYSTEM.ts and MISSING_INPUTS_USER_PROMPT.ts
- Process:
  1. Extract tool schemas (in params) from registry for each planned step
  2. Build context with user message, provided info, and tool requirements
  3. LLM analyzes what's truly missing vs. can be inferred
  4. Returns array of missing inputs with natural questions and types
  5. Fallback to Zod validation if LLM fails
- Benefits: Contextual understanding, avoids asking for info that can be inferred

**Events**

- Publisher: packages/agent/observability/events.ts
- Notable event types: `plan_generated`, `tool.called`, `tool.succeeded`, `tool.failed`, `awaiting.input`, `run_completed`.
- The graph wires hooks to emit `node.enter`, `node.exit`, and `edge.taken`.

**Routing & Approvals**

- Edges are declared in packages/agent/buildMainGraph.ts.
- Mode-based routing in planner edge:
  - PREVIEW: Shows plan only, doesn't execute
  - APPROVAL: Halts for user approval before execution
  - AUTO: Proceeds to execution after validation

**Persistence**

- Prisma model `run.output` stores the latest user-visible output and errors.
- The worker strips `scratch` from `run.output` when restoring initial state but merges any `output.scratch` into `state.scratch` for continuity (answers, etc.).

**Extending The Graph**

- Add a node: implement `Node<RunState>` and register via `buildMainGraph.ts`.
- Add tools: register in packages/agent/registry/registry.ts; expose `undo` if applicable; define Zod schema for `in` params.
- Add an app integration: implement service in packages/appstore/\* and provide a tool wrapper in the registry with proper schema validation.
