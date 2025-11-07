// packages/agent/nodes/executor.ts
import type { Node } from '../runtime/graph.js';
import type { RunState } from '../state/types.js';
import type { RunEventBus } from '@quikday/libs';
import { runWithCurrentUser } from '@quikday/libs';
import { CHANNEL_WEBSOCKET } from '@quikday/libs';
import { registry } from '../registry/registry.js';
import { events } from '../observability/events.js';
import { redactForLog } from '../guards/redaction.js';
import { Queue, QueueEvents, JobsOptions } from 'bullmq';

/** Generic heuristic to determine if a tool result has meaningful output. */
function computeHasOutput(result: any): boolean {
  if (result === null || result === undefined) return false;
  if (typeof result === 'string') return result.trim().length > 0;
  if (typeof result === 'number' || typeof result === 'boolean') return true;
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result === 'object') {
    // Generic array/object heuristic (no hardcoded keys):
    // - If any top-level array property is non-empty → has output
    // - If there are array properties but all are empty AND there are no other meaningful fields → no output
    // - Otherwise continue to other checks
    const entries = Object.entries(result as any);
    let sawArray = false;
    let anyArrayNonEmpty = false;
    let hasOtherMeaningful = false;
    for (const [, v] of entries) {
      if (Array.isArray(v)) {
        sawArray = true;
        if (v.length > 0) anyArrayNonEmpty = true;
      } else if (v !== null && v !== undefined) {
        if (typeof v === 'string') {
          if (v.trim().length > 0) hasOtherMeaningful = true;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          hasOtherMeaningful = true;
        } else if (typeof v === 'object') {
          if (Object.keys(v).length > 0) hasOtherMeaningful = true;
        }
      }
    }
    if (sawArray) {
      if (anyArrayNonEmpty) return true;
      // If we saw array fields and all are empty, treat as no output
      // even if flags like { ok: true } are present.
      return false;
    }
    // If a numeric count is present and zero and no other fields, treat as no output
    if ('count' in (result as any) && Number((result as any).count) === 0) {
      // Check if there are any other meaningful fields besides count
      const keys = Object.keys(result as any).filter((k) => k !== 'count');
      const hasOtherMeaningful = keys.some((k) => {
        const v = (result as any)[k];
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim().length > 0;
        if (typeof v === 'number' || typeof v === 'boolean') return true;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return Boolean(v);
      });
      if (!hasOtherMeaningful) return false;
    }
    return Object.keys(result).length > 0;
  }
  return Boolean(result);
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Render a simple Markdown table for top-level key/value pairs. */
function toSimpleTable(args: Record<string, any>): string {
  try {
    const entries = Object.entries(args ?? {});
    if (entries.length === 0) return 'No inputs';
    const shorten = (v: any) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v.length > 200 ? v.slice(0, 197) + '…' : v;
      try {
        const s = JSON.stringify(v);
        return s.length > 200 ? s.slice(0, 197) + '…' : s;
      } catch {
        return String(v);
      }
    };
    const rows = entries.map(([k, v]) => `| ${k} | ${shorten(v)} |`).join('\n');
    return ['| Field | Value |', '| --- | --- |', rows].join('\n');
  } catch {
    return 'No inputs';
  }
}

/** Safe JSON clone for event payloads (drops functions/undefined/cycles). */
function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return null;
  }
}

/** Transient error detection (for retries). */
function isTransient(err: any): boolean {
  const code = (err?.code ?? '').toString().toUpperCase();
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  if (code === 'RATE_LIMIT' || code === 'CIRCUIT_OPEN') return true;
  if (['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNABORTED'].includes(code))
    return true;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

/** Retry with exponential backoff + jitter. */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseMs: number; maxMs: number },
): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt <= opts.retries) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isTransient(err) || attempt === opts.retries) break;
      const exp = Math.min(opts.maxMs, opts.baseMs * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * (exp * 0.25));
      const delay = exp + jitter;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

/** Let tools derive undo args themselves if they support it. */
async function deriveUndoArgs(tool: any, result: any, args: any) {
  if (typeof tool?.undo === 'function') {
    try {
      return await tool.undo({ result, args });
    } catch {
      // pass-through on failure
    }
  }
  return args;
}

/**
 * Resolve placeholders in arguments referencing previous step outputs.
 * Supports:
 * - "$step-01.fieldName" → single value from step-01's result
 * - "$step-01.fieldName[*]" → iteration marker (executor will handle expansion)
 */
function resolvePlaceholders(
  args: any,
  stepResults: Map<string, any>,
): { resolved: any; needsExpansion: boolean; expansionKey?: string } {
  if (typeof args !== 'object' || args === null) {
    return { resolved: args, needsExpansion: false };
  }

  if (Array.isArray(args)) {
    return {
      resolved: args.map((item) => resolvePlaceholders(item, stepResults).resolved),
      needsExpansion: false,
    };
  }

  const resolved: any = {};
  let needsExpansion = false;
  let expansionKey: string | undefined;

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.startsWith('$step-')) {
      // Check for array expansion marker: $step-01.threads[*].threadId
      const arrayMatch = value.match(/^\$step-(\d+)\.([^[]+)\[\*\](?:\.(.+))?$/);
      if (arrayMatch) {
        const [, stepNum, arrayField, subField] = arrayMatch;
        const stepId = `step-${stepNum}`;
        needsExpansion = true;
        expansionKey = `${stepId}.${arrayField}`;
        // Mark this for expansion later
        resolved[key] = { $expand: stepId, arrayField, subField };
        continue;
      }

      // Simple placeholder: $step-01.fieldName
      const simpleMatch = value.match(/^\$step-(\d+)\.(.+)$/);
      if (simpleMatch) {
        const [, stepNum, fieldPath] = simpleMatch;
        const stepId = `step-${stepNum}`;
        const stepResult = stepResults.get(stepId);

        if (stepResult) {
          // Navigate the field path (e.g., "threads.0.threadId")
          const fields = fieldPath.split('.');
          let val = stepResult;
          for (const field of fields) {
            val = val?.[field];
            if (val === undefined) break;
          }

          // Safety check: If the resolved value is an array or complex object,
          // and it wasn't explicitly meant for expansion (no [*] marker),
          // convert it to a string representation or undefined to prevent
          // type mismatches (e.g., passing [] to a string field).
          if (val !== undefined && val !== null) {
            if (Array.isArray(val)) {
              if (val.length === 0) {
                // Empty arrays resolve to undefined to avoid passing [] to string fields
                console.warn(`[executor] Placeholder ${value} resolved to empty array; setting to undefined to avoid type errors`);
                resolved[key] = undefined;
              } else {
                // Non-empty arrays might be legitimate for array-typed fields,
                // but warn if this seems like a mistake
                console.warn(`[executor] Placeholder ${value} resolved to array with ${val.length} items:`, val);
                resolved[key] = val;
              }
            } else if (typeof val === 'object' && Object.keys(val).length > 0) {
              // Complex objects (not primitive) might indicate a planning error
              console.warn(`[executor] Placeholder ${value} resolved to object:`, val);
              resolved[key] = val;
            } else {
              resolved[key] = val;
            }
          } else {
            resolved[key] = val;
          }
        } else {
          resolved[key] = value; // Keep placeholder if step not executed yet
        }
        continue;
      }
    }

    // Recurse for nested objects
    if (typeof value === 'object' && value !== null) {
      const nested = resolvePlaceholders(value, stepResults);
      resolved[key] = nested.resolved;
      if (nested.needsExpansion) {
        needsExpansion = true;
        expansionKey = nested.expansionKey;
      }
    } else {
      resolved[key] = value;
    }
  }

  return { resolved, needsExpansion, expansionKey };
}

/** Collect base step ids referenced via placeholders like "$step-02.field" */
function collectBasePlaceholders(args: any): Set<string> {
  const bases = new Set<string>();
  const walk = (v: any) => {
    if (typeof v === 'string') {
      const m = v.match(/^\$step-(\d+)\./);
      if (m) bases.add(`step-${m[1]}`);
      return;
    }
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
      return;
    }
    if (v && typeof v === 'object') {
      for (const val of Object.values(v)) walk(val);
    }
  };
  walk(args);
  return bases;
}

/** Get child results for a base step id: step-02-0, step-02-1, ... (sorted by suffix) */
function getChildResults(stepResults: Map<string, any>, baseId: string): Array<{ id: string; result: any }> {
  const prefix = `${baseId}-`;
  const out: Array<{ id: string; result: any }> = [];
  for (const [id, result] of stepResults.entries()) {
    if (id.startsWith(prefix)) out.push({ id, result });
  }
  out.sort((a, b) => {
    const na = Number(a.id.slice(prefix.length)) || 0;
    const nb = Number(b.id.slice(prefix.length)) || 0;
    return na - nb;
  });
  return out;
}

function getByPath(obj: any, path: string) {
  return path.split('.').reduce((acc: any, k: string) => (acc == null ? undefined : acc[k]), obj);
}

/** Replace "$step-XX.something" with values from a given child result */
function replacePlaceholdersWithChild(args: any, baseId: string, childResult: any): any {
  if (typeof args === 'string') {
    const m = args.match(/^\$step-(\d+)\.(.+)$/);
    if (m && `step-${m[1]}` === baseId) {
      return getByPath(childResult, m[2]);
    }
    return args;
  }
  if (Array.isArray(args)) return args.map((v) => replacePlaceholdersWithChild(v, baseId, childResult));
  if (args && typeof args === 'object') {
    const out: any = Array.isArray(args) ? [] : {};
    for (const [k, v] of Object.entries(args)) out[k] = replacePlaceholdersWithChild(v as any, baseId, childResult);
    return out;
  }
  return args;
}

/**
 * Expand a step that has array iteration placeholders into multiple concrete steps.
 * Example: If step-01 returned { threads: [{id: 'a'}, {id: 'b'}] },
 * then a step with args { threadId: "$step-01.threads[*].id" }
 * expands to multiple steps with threadId: 'a' and threadId: 'b'.
 */
function expandStepForArray(
  step: any,
  stepResults: Map<string, any>,
): any[] {
  const { resolved, needsExpansion, expansionKey } = resolvePlaceholders(step.args, stepResults);

  if (!needsExpansion || !expansionKey) {
    return [{ ...step, args: resolved }];
  }

  // Extract the array to iterate over
  const [stepId, arrayField] = expansionKey.split('.');
  const stepResult = stepResults.get(stepId);
  const array = stepResult?.[arrayField];

  if (!Array.isArray(array) || array.length === 0) {
    console.warn(`[executor] Expected array at ${expansionKey} but got:`, array);
    return []; // Skip this step if array is empty/missing
  }

  // Create one step per array item
  const expandedSteps = array.map((item, idx) => {
    const expandedArgs: any = {};

    for (const [key, value] of Object.entries(resolved)) {
      if (value && typeof value === 'object' && '$expand' in value) {
        const { subField } = value as any;
        expandedArgs[key] = subField ? item[subField] : item;
      } else {
        expandedArgs[key] = value;
      }
    }

    return {
      ...step,
      id: `${step.id}-${idx}`,
      args: expandedArgs,
    };
  });

  return expandedSteps;
}

/** ────────────────────────────────────────────────────────────────────────────
 * Executor node
 * 
 * Executes each planned step from the plan, with support for:
 * - Placeholder resolution (e.g., "$step-01.fieldName")
 * - Array iteration expansion (e.g., "$step-01.threads[*].id")
 * - High-risk tool approval flow
 * - Retry logic with exponential backoff
 * - Idempotency and undo support
 * 
 * HIGH-RISK TOOL APPROVAL FLOW:
 * ═════════════════════════════════════════════════════════════════════════════
 * Tools marked with risk: 'high' (e.g., calendar.createEvent, calendar.updateEvent,
 * calendar.cancelEvent) require explicit user approval BEFORE execution.
 * 
 * Process:
 * 1. Before executing a step, check if tool.risk === 'high'
 * 2. If high-risk and not pre-approved:
 *    - Emit 'approval.awaiting' event with step details (id, tool, args, risk)
 *    - Throw GRAPH_HALT_AWAITING_APPROVAL error to pause graph execution
 *    - Frontend displays approval UI to user
 * 3. User reviews and approves/rejects via API endpoint (POST /runs/:id/approve)
 * 4. API resumes run with approvedSteps in ctx.meta
 * 5. Executor checks isApprovedStep() and proceeds with execution
 * 
 * chat.respond is always executed without approval (low-risk conversation tool).
 * ═════════════════════════════════════════════════════════════════════════════
 * ─────────────────────────────────────────────────────────────────────────── */
export const executor: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const commits: Array<{ stepId: string; result: unknown }> = [];
  const undo: Array<{ stepId: string; tool: string; args: unknown }> = [];
  const stepResults = new Map<string, any>(); // Store results by step ID

  // ──────────────────────────────────────────────────────────────────────────
  // APPROVED STEPS TRACKING
  // ──────────────────────────────────────────────────────────────────────────
  // When resuming execution after user approval, ctx.meta.approvedSteps contains
  // the list of step IDs that the user explicitly approved (e.g., ["step-01"]).
  // This set is used to determine which high-risk steps can proceed.
  // If the set is empty, all steps are implicitly approved (initial run).
  // ──────────────────────────────────────────────────────────────────────────
  const approvedSteps = new Set<string>(
    Array.isArray((s.ctx as any)?.meta?.approvedSteps)
      ? (((s.ctx as any).meta?.approvedSteps as string[]) ?? [])
      : []
  );

  /**
   * Check if a step is approved for execution.
   * @param id - The step ID (e.g., "step-01", "step-01-0")
   * @param isHighRisk - Whether the step's tool is marked as high-risk
   * @returns true if the step is approved to execute
   */
  const isApprovedStep = (id: string, isHighRisk: boolean): boolean => {
    // Low-risk steps always execute without approval
    if (!isHighRisk) return true;

    // If no approvedSteps list exists (initial run), high-risk steps need approval
    if (approvedSteps.size === 0) return false;

    // Check if this specific step ID is approved
    if (approvedSteps.has(id)) return true;

    // For expanded steps (e.g., "step-01-0"), check if base step is approved
    const m = id.match(/^step-\d+/);
    return m ? approvedSteps.has(m[0]) : false;
  };

  // Lazy init BullMQ queue for step execution
  let stepQueue: Queue | null = null;
  let stepQueueEvents: QueueEvents | null = null;
  const getStepQueue = () => {
    if (!stepQueue) {
      const url = process.env.REDIS_URL || process.env.REDIS_URL_HTTP || process.env.REDIS_URL_WS;
      if (!url) return null;
      stepQueue = new Queue('steps', { connection: { url } as any });
      stepQueueEvents = new QueueEvents('steps', { connection: { url } as any });
    }
    return stepQueue;
  };

  async function runStepViaQueue(planStepId: string, toolName: string, args: any) {
    const q = getStepQueue();
    if (!q || !stepQueueEvents) {
      // Fallback to direct call if queue not available
      return runWithCurrentUser(
        ({ userSub: s.ctx.userId ? String(s.ctx.userId) : null, teamId: s.ctx.teamId ? Number(s.ctx.teamId) : null, scopes: s.ctx.scopes } as any),
        () => registry.call(toolName, args, s.ctx)
      );
    }

    const jobId = `run-${s.ctx.runId}-step-${planStepId}-${Date.now().toString(36)}`;
    const jobOpts: JobsOptions = {
      jobId,
      attempts: 2,
      removeOnComplete: 100,
      removeOnFail: 100,
      backoff: { type: 'exponential', delay: 1000 },
    };
    const __ctx = {
      userSub: s.ctx.userId ? String(s.ctx.userId) : null,
      teamId: s.ctx.teamId ? Number(s.ctx.teamId) : null,
      scopes: s.ctx.scopes,
      traceId: s.ctx.traceId,
      tz: s.ctx.tz,
      runId: s.ctx.runId,
    } as any;

    const job = await q.add('execute-step', {
      runId: s.ctx.runId,
      planStepId,
      tool: toolName,
      args,
      __ctx,
    }, jobOpts);

    const res = await job.waitUntilFinished(stepQueueEvents, 60_000);
    return (res as any)?.result ?? null;
  }

  // Process steps dynamically - expand array iterations as we go
  const planQueue = [...(s.scratch?.plan ?? [])];
  const processedStepIds = new Set<string>();

  console.log(`[executor] Starting execution with ${planQueue.length} steps in queue`);
  console.log(`[executor] Plan:`, planQueue.map(s => ({ id: s.id, tool: s.tool, risk: s.risk })));

  while (planQueue.length > 0) {
    const step = planQueue.shift()!;

    console.log(`[executor] Processing step: ${step.id} (${step.tool}), queue remaining: ${planQueue.length}`);

    // Skip if already processed (from expansion)
    if (processedStepIds.has(step.id)) {
      console.log(`[executor] Skipping already processed step: ${step.id}`);
      continue;
    }

    const isChat = step.tool === 'chat.respond';
    const tool = registry.get(step.tool);
    const isHighRisk = tool?.risk === 'high';

    // Check if this step needs array expansion
    const expanded = expandStepForArray(step, stepResults);

    if (expanded.length > 1) {
      // Array expansion happened - add all expanded steps to front of queue
      planQueue.unshift(...expanded);
      processedStepIds.add(step.id); // Mark original as processed
      continue; // Process expanded steps next
    }

    // Take the first (and only) expanded step
    const currentStep = expanded[0] || step;

    // Dependency gating: skip this step if any of its dependencies had no output
    try {
      const baseId = (currentStep.id.match(/^step-\d+/) || [currentStep.id])[0];
      const planArr = Array.isArray(s.scratch?.plan) ? (s.scratch!.plan as any[]) : [];
      const planEntry = planArr.find((p) => p && p.id === baseId);
      const deps: string[] = Array.isArray(planEntry?.dependsOn) ? planEntry.dependsOn : [];
      const blocked = deps.some((depId) => {
        const dep = planArr.find((p) => p && p.id === depId);
        return dep?.hasOutput === false;
      });
      if (blocked) {
        console.log(`[executor] Skipping ${currentStep.id} due to dependency without output`);
        processedStepIds.add(currentStep.id);
        commits.push({ stepId: currentStep.id, result: { skipped: true, reason: 'dependency_no_output' } });
        continue;
      }
    } catch { }

    // Resolve placeholders in args
    const { resolved: resolvedArgs } = resolvePlaceholders(currentStep.args, stepResults);

    // Merge answers from scratch into resolved args
    // This ensures user-provided answers (e.g., "to" for email recipient) are included
    const answers = (s.scratch?.answers ?? {}) as Record<string, unknown>;
    const argsWithAnswers = { ...resolvedArgs, ...answers };

    // Implicit fan-out: if args still reference a base step id (e.g., "$step-02.*")
    // and only child commits like step-02-0/1 exist, expand one send per child.
    const bases = collectBasePlaceholders(argsWithAnswers);
    const unresolvedBases = Array.from(bases).filter((baseId) => !stepResults.has(baseId) && getChildResults(stepResults, baseId).length > 0);
    if (unresolvedBases.length === 1) {
      const baseId = unresolvedBases[0];
      const children = getChildResults(stepResults, baseId);
      if (children.length > 0) {
        const fanout = children.map((child, idx) => ({
          ...currentStep,
          id: `${currentStep.id}-${idx}`,
          args: replacePlaceholdersWithChild(currentStep.args, baseId, child.result),
        }));
        planQueue.unshift(...fanout);
        processedStepIds.add(currentStep.id);
        continue;
      }
    }

    // After implicit fan-out, ensure no unresolved placeholders remain
    const containsUnresolved = (v: any): boolean => {
      if (typeof v === 'string') return /^\$step-\d+\./.test(v);
      if (Array.isArray(v)) return v.some(containsUnresolved);
      if (v && typeof v === 'object') return Object.values(v).some(containsUnresolved);
      return false;
    };
    if (containsUnresolved(argsWithAnswers)) {
      const err: any = new Error(`Unresolved placeholders in arguments for ${currentStep.tool}`);
      err.code = 'E_ARGS_UNRESOLVED';
      events.toolFailed(s, eventBus, currentStep.tool, { code: err.code, message: err.message }, currentStep.id);
      (s as any).error = { node: 'executor', message: err.message, code: err.code };
      throw err;
    }

    // Parse args - Remove undefined values and expansion markers to avoid validation errors
    // When placeholders resolve to empty arrays or missing fields, we get undefined values
    // or expansion marker objects like { $expand: "step-01", arrayField: "messages" }
    // which cause Zod validation to fail. Filter them out before validation.
    const cleanArgs = Object.fromEntries(
      Object.entries(argsWithAnswers ?? {})
        .map(([k, v]) => {
          // Remove expansion markers (objects with $expand property)
          // These remain when array expansion fails due to empty arrays
          if (v && typeof v === 'object' && '$expand' in v) {
            console.warn(`[executor] Removing unresolved expansion marker from field "${k}":`, v);
            return [k, undefined];
          }

          // Remove strings that contain unresolved array expansion placeholders
          // e.g., "Re: $step-01.messages[*].subject" should be removed entirely
          if (typeof v === 'string' && v.includes('[*]')) {
            console.warn(`[executor] Removing field "${k}" with unresolved array placeholder: "${v}"`);
            return [k, undefined];
          }

          return [k, v];
        })
        .filter(([_, v]) => v !== undefined) // Remove undefined values
    );

    let args: any = cleanArgs;
    if (isChat) {
      // Try tool schema if available; otherwise accept as-is for resilience
      try {
        if (tool?.in) {
          const parsed = tool.in.safeParse(cleanArgs);
          if (parsed.success) args = parsed.data;
        }
      } catch {
        // ignore schema issues for chat.respond
      }
    } else {
      // Strict for non-chat tools
      const parsed = tool.in.safeParse(cleanArgs);
      if (!parsed.success) {
        const zerr = parsed.error?.flatten?.() ?? parsed.error;
        const err: any = new Error(`Invalid args for ${currentStep.tool}`);
        err.code = 'E_ARGS_INVALID';
        err.details = zerr;
        events.toolFailed(s, eventBus, currentStep.tool, { code: err.code, details: zerr }, currentStep.id);
        (s as any).error = { node: 'executor', message: err.message, code: err.code };
        throw err;
      }
      args = parsed.data;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // HIGH-RISK TOOL APPROVAL CHECK (BEFORE EXECUTION)
    // ──────────────────────────────────────────────────────────────────────────
    // Before executing any step, check if the tool is marked as high-risk.
    // High-risk tools (e.g., calendar.createEvent, calendar.updateEvent, calendar.cancelEvent)
    // require explicit user approval before execution.
    //
    // Flow:
    // 1. Check if tool.risk === 'high'
    // 2. Check if step is not already pre-approved (via ctx.meta.approvedSteps)
    // 3. If approval needed:
    //    a. Emit 'approval.awaiting' event with step details
    //    b. Throw GRAPH_HALT_AWAITING_APPROVAL error to pause execution
    //    c. Wait for user to approve via API endpoint
    //    d. Resume execution with approvedSteps in ctx.meta
    // ──────────────────────────────────────────────────────────────────────────
    if (!isChat && isHighRisk && !isApprovedStep(currentStep.id, isHighRisk)) {
      console.log(`[executor] High-risk tool detected: ${currentStep.tool} (step: ${currentStep.id}). Requesting approval...`);

      // Surface approval-needed to subscribers with step details
      try {
        events.approvalAwaiting(s, eventBus, [
          { id: currentStep.id, tool: currentStep.tool, args: redactForLog(args), risk: 'high' },
        ]);
      } catch (eventErr) {
        // Event emission failure is non-fatal, but log for debugging
        console.warn(`[executor] Failed to emit approval.awaiting event:`, eventErr);
      }

      // Halt graph execution and wait for user approval
      const err: any = new Error('GRAPH_HALT_AWAITING_APPROVAL');
      err.code = 'GRAPH_HALT_AWAITING_APPROVAL';
      err.payload = { stepId: currentStep.id, tool: currentStep.tool };
      (s as any).error = { node: 'executor', code: err.code, message: 'awaiting approval' };

      console.log(`[executor] Execution halted for approval. Step: ${currentStep.id}`);
      throw err;
    }

    // Emit "called" (suppress for chat.respond to avoid Execution Log)
    if (!isChat) {
      const safeArgs = redactForLog(args);
      events.toolCalled(s, eventBus, currentStep.tool, safeArgs, currentStep.id);

      // Also emit a lightweight UI message showing input params as a table
      try {
        const table = toSimpleTable(safeArgs as any);
        await eventBus.publish(
          s.ctx.runId,
          {
            type: 'assistant.delta',
            payload: {
              stepId: currentStep.id,
              text: `Executing ${currentStep.tool} with inputs:\n\n${table}`,
              ts: new Date().toISOString(),
            },
          },
          CHANNEL_WEBSOCKET,
        );
      } catch {
        // non-fatal
      }
    }

    const t0 = globalThis.performance?.now?.() ?? Date.now();

    try {
      const result = await withRetry(
        () =>
          (isChat
            ? runWithCurrentUser(
                ({ userSub: s.ctx.userId ? String(s.ctx.userId) : null, teamId: s.ctx.teamId ? Number(s.ctx.teamId) : null, scopes: s.ctx.scopes } as any),
                () => registry.call(currentStep.tool, args, s.ctx),
              )
            : runStepViaQueue(currentStep.id, currentStep.tool, args)
          ),
        {
          retries: 3,
          baseMs: 500,
          maxMs: 5_000,
        },
      );

      const duration = (globalThis.performance?.now?.() ?? Date.now()) - t0;

      // Emit success (suppress for chat.respond to avoid Execution Log)
      // The tool.succeeded event includes the result which can be persisted by subscribers
      if (!isChat) {
        const safeResult = redactForLog(result as any);
        events.toolSucceeded(s, eventBus, currentStep.tool, safeResult, duration, currentStep.id);

        // Emit step.executed event with full details for persistence
        // Subscribers (like run processor) can listen to this to save to DB
        events.stepExecuted(s, eventBus, {
          id: currentStep.id,
          tool: currentStep.tool,
          args,
          result,
          startedAt: new Date(t0),
          endedAt: new Date(),
        });
      }

      // Persist commit
      commits.push({ stepId: currentStep.id, result });

      // Store result for subsequent placeholder resolution
      stepResults.set(currentStep.id, result);

      // Update hasOutput on the base plan step for dependency gating
      try {
        const baseId = (currentStep.id.match(/^step-\d+/) || [currentStep.id])[0];
        const planArr = Array.isArray(s.scratch?.plan) ? (s.scratch!.plan as any[]) : [];
        const idx = planArr.findIndex((p) => p && p.id === baseId);
        if (idx >= 0) {
          const updated = { ...planArr[idx], hasOutput: computeHasOutput(result) };
          planArr[idx] = updated;
          s.scratch = { ...(s.scratch || {}), plan: planArr } as any;
        }
      } catch { }

      // For chat.respond, send assistant message to UI
      if (
        isChat &&
        result &&
        typeof result === 'object' &&
        result !== null &&
        'message' in result &&
        typeof (result as any).message === 'string'
      ) {
        const text = (result as any).message;
        try {
          await eventBus.publish(
            s.ctx.runId,
            {
              type: 'assistant.final',
              payload: { stepId: currentStep.id, text, ts: new Date().toISOString() },
            },
            CHANNEL_WEBSOCKET,
          );
        } catch {
          // non-fatal
        }
      }

      // Queue undo if supported (not relevant for chat.respond)
      if (!isChat && tool?.undo) {
        const uArgs = await deriveUndoArgs(tool, result, args);
        undo.push({ stepId: currentStep.id, tool: currentStep.tool, args: uArgs });
      }
    } catch (error: any) {
      // Non-chat tools keep failure semantics (graph may route to fallback)
      const payload = {
        code: (error?.code ?? 'E_STEP_FAILED') as string,
        message: error?.message ?? String(error),
        status: error?.status ?? error?.response?.status,
      };
      events.toolFailed(s, eventBus, currentStep.tool, payload, currentStep.id);
      (s as any).error = { node: 'executor', ...payload };
      throw error;
    }

    // Mark this step as processed
    processedStepIds.add(currentStep.id);
  }

  // Optional: broadcast undo queue if any
  if (undo.length > 0 && (events as any).undoEnqueued) {
    const undoForEvents: Json = undo.map((u) => ({
      stepId: u.stepId,
      tool: u.tool,
      args: toJson(u.args),
    })) as Json;
    (events as any).undoEnqueued(s, eventBus, redactForLog(undoForEvents));
  }

  return { output: { ...s.output, commits, undo } };
};
