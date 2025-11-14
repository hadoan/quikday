// packages/agent/nodes/executor.ts
import type { Node } from '../runtime/graph.js';
import type { RunCtx, RunState } from '../state/types.js';
import type { RunEventBus } from '@quikday/libs';
import { runWithCurrentUser, getCurrentUserCtx } from '@quikday/libs';
import { CHANNEL_WEBSOCKET } from '@quikday/libs';
import { registry } from '../registry/registry.js';
import { events } from '../observability/events.js';
import { redactForLog } from '../guards/redaction.js';

// Executor helpers (SOLID/DRY)
import {
  computeHasOutput,
  deriveUndoArgs,
  toJson,
  toSimpleTable,
  withRetry,
} from './executor/utils.js';
import { resolvePlaceholders } from './executor/placeholders.js';
import { expandStepForArray } from './executor/expand.js';
import { createQueueHelpers } from './executor/queue.js';

/** Get child results for a base step id: step-02-0, step-02-1, ... (sorted by suffix) */
function getChildResults(
  stepResults: Map<string, any>,
  baseId: string,
): Array<{ id: string; result: any }> {
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

export const executor: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const commits: Array<{ stepId: string; result: unknown }> = [];
  const undo: Array<{ stepId: string; tool: string; args: unknown }> = [];
  const stepResults = new Map<string, any>();

  // ──────────────────────────────────────────────────────────────────────────
  // APPROVED STEPS TRACKING
  // ──────────────────────────────────────────────────────────────────────────
  const approvedSteps = new Set<string>(
    Array.isArray((s.ctx as any)?.meta?.approvedSteps)
      ? (((s.ctx as any).meta?.approvedSteps as string[]) ?? [])
      : [],
  );
  const isApprovedStep = (id: string, isHighRisk: boolean): boolean => {
    if (!isHighRisk) return true;
    if (approvedSteps.size === 0) return false;
    if (approvedSteps.has(id)) return true;
    const m = id.match(/^step-\d+/);
    return m ? approvedSteps.has(m[0]) : false;
  };

  // Queue helper for off-thread tool execution
  const { runStepViaQueue } = createQueueHelpers(s);

  // Process steps dynamically - expand array iterations as we go
  const planQueue = [...(s.scratch?.plan ?? [])];
  const processedStepIds = new Set<string>();

  console.log(`[executor] Starting execution with ${planQueue.length} steps in queue`);
  console.log(
    `[executor] Plan:`,
    planQueue.map((p) => ({ id: p.id, tool: p.tool, risk: p.risk })),
  );

  while (planQueue.length > 0) {
    const step = planQueue.shift()!;

    console.log(
      `[executor] Processing step: ${step.id} (${step.tool}), queue remaining: ${planQueue.length}`,
    );

    // Skip if already processed (from expansion)
    if (processedStepIds.has(step.id)) {
      console.log(`[executor] Skipping already processed step: ${step.id}`);
      continue;
    }

    const isChat = step.tool === 'chat.respond';
    const tool = registry.get(step.tool);
    const isHighRisk = tool?.risk === 'high';

    // Check if this step needs array expansion (explicit expandOn or legacy [*])
    const expanded = expandStepForArray(step, stepResults, s);

    if (expanded.length > 1) {
      // Array expansion happened - add all expanded steps to front of queue
      planQueue.unshift(...expanded);
      processedStepIds.add(step.id); // Mark original as processed
      continue; // Process expanded steps next
    }

    // Take the first (and only) expanded step
    const currentStep = expanded[0] || step;

    // Dependency gating: skip this step if any of its dependencies had no output
    const basePlanId = (currentStep.id.match(/^step-\d+/) || [currentStep.id])[0];
    const planArr = Array.isArray(s.scratch?.plan) ? (s.scratch!.plan as any[]) : [];
    const toolContextList = Array.isArray(s.scratch?.tools)
      ? (s.scratch!.tools as any[])
      : undefined;
    const currentToolContext =
      toolContextList?.find((ctx: any) => ctx?.planStepId === basePlanId) ??
      toolContextList?.find((ctx: any) => ctx?.tool === currentStep.tool) ??
      null;
    const ctxForCall: RunCtx =
      toolContextList || currentToolContext
        ? ({
            ...s.ctx,
            ...(toolContextList ? { tools: toolContextList } : {}),
            currentTool: currentToolContext,
          } as RunCtx)
        : s.ctx;

    try {
      const planEntry = planArr.find((p) => p && p.id === basePlanId);
      const deps: string[] = Array.isArray(planEntry?.dependsOn) ? planEntry.dependsOn : [];
      const blocked = deps.some((depId) => {
        const dep = planArr.find((p) => p && p.id === depId);
        return dep?.hasOutput === false;
      });
      if (blocked) {
        console.log(`[executor] Skipping ${currentStep.id} due to dependency without output`);
        processedStepIds.add(currentStep.id);
        commits.push({
          stepId: currentStep.id,
          result: { skipped: true, reason: 'dependency_no_output' },
        });
        continue;
      }
    } catch {}

    // Resolve placeholders in args (support $var.*)
    const { resolved: resolvedArgs } = resolvePlaceholders(
      currentStep.args,
      stepResults,
      (s.scratch?.vars ?? null) as any,
      null,
    );

    // Merge answers from scratch into resolved args
    const answers = (s.scratch?.answers ?? {}) as Record<string, unknown>;
    const argsWithAnswers = { ...resolvedArgs, ...answers };

    // Legacy implicit fan-out removed — require explicit expandOn + $each

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
      events.toolFailed(
        s,
        eventBus,
        currentStep.tool,
        { code: err.code, message: err.message },
        currentStep.id,
      );
      (s as any).error = { node: 'executor', message: err.message, code: err.code };
      throw err;
    }

    // Parse args - Remove undefined values and expansion markers to avoid validation errors
    const cleanArgs = Object.fromEntries(
      Object.entries(argsWithAnswers ?? {})
        .map(([k, v]) => {
          if (v && typeof v === 'object' && '$expand' in v) {
            console.warn(`[executor] Removing unresolved expansion marker from field "${k}":`, v);
            return [k, undefined];
          }
          if (typeof v === 'string' && v.includes('[*]')) {
            console.warn(
              `[executor] Removing field "${k}" with unresolved array placeholder: "${v}"`,
            );
            return [k, undefined];
          }
          return [k, v];
        })
        .filter(([_, v]) => v !== undefined),
    );

    let args: any = cleanArgs;
    if (isChat) {
      // Try tool schema if available; otherwise accept as-is for resilience
      try {
        if (tool?.in) {
          const parsed = tool.in.safeParse(cleanArgs);
          if (parsed.success) args = parsed.data;
        }
      } catch {}
    } else {
      // Strict for non-chat tools
      const parsed = tool.in.safeParse(cleanArgs);
      if (!parsed.success) {
        const zerr = parsed.error?.flatten?.() ?? parsed.error;
        const err: any = new Error(`Invalid args for ${currentStep.tool}`);
        err.code = 'E_ARGS_INVALID';
        err.details = zerr;
        events.toolFailed(
          s,
          eventBus,
          currentStep.tool,
          { code: err.code, details: zerr },
          currentStep.id,
        );
        (s as any).error = { node: 'executor', message: err.message, code: err.code };
        throw err;
      }
      args = parsed.data;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // HIGH-RISK TOOL APPROVAL CHECK (BEFORE EXECUTION)
    // ──────────────────────────────────────────────────────────────────────────
    if (!isChat && isHighRisk && !isApprovedStep(currentStep.id, isHighRisk)) {
      console.log(
        `[executor] High-risk tool detected: ${currentStep.tool} (step: ${currentStep.id}). Requesting approval...`,
      );

      // Surface approval-needed to subscribers with step details
      try {
        events.approvalAwaiting(s, eventBus, [
          { id: currentStep.id, tool: currentStep.tool, args: redactForLog(args), risk: 'high' },
        ]);
      } catch (eventErr) {
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
      } catch {}
    }

    const t0 = globalThis.performance?.now?.() ?? Date.now();

    try {
      const result = await withRetry(
        () =>
          isChat
            ? runWithCurrentUser(getCurrentUserCtx(), () =>
                registry.call(currentStep.tool, args, ctxForCall),
              )
            : runStepViaQueue(
                currentStep.id,
                currentStep.tool,
                args,
                toolContextList,
                currentToolContext,
              ),
        { retries: 3, baseMs: 500, maxMs: 5_000 },
      );

      const duration = (globalThis.performance?.now?.() ?? Date.now()) - t0;

      // Emit success (suppress for chat.respond to avoid Execution Log)
      // The tool.succeeded event includes the result which can be persisted by subscribers
      if (!isChat) {
        const safeResult = redactForLog(result as any);
        events.toolSucceeded(s, eventBus, currentStep.tool, safeResult, duration, currentStep.id);

        // Emit step.executed event with full details for persistence
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
      } catch {}

      // Bind parts of result to scratch.vars if requested
      try {
        const binds: Record<string, string> | undefined = (currentStep as any)?.binds;
        if (binds && typeof binds === 'object') {
          const prevVars = (s.scratch?.vars ?? {}) as Record<string, unknown>;
          const nextVars: Record<string, unknown> = { ...prevVars };
          const normalize = (p: string) => p.replace(/\[(\d+)\]/g, '.$1');
          const sel = (expr: string) => {
            if (expr === '$') return result;
            if (expr.startsWith('$.'))
              return normalize(expr.slice(2))
                .split('.')
                .filter(Boolean)
                .reduce((acc: any, k) => (acc == null ? undefined : acc[k]), result);
            if (expr.startsWith('$var.'))
              return normalize(expr.slice(5))
                .split('.')
                .filter(Boolean)
                .reduce((acc: any, k) => (acc == null ? undefined : acc[k]), prevVars);
            if (expr.startsWith('$step-')) {
              const err: any = new Error(
                'Step placeholders are not supported in binds. Use $ or $var.*',
              );
              err.code = 'E_PLACEHOLDER_UNSUPPORTED';
              throw err;
            }
            return undefined;
          };
          for (const [name, expr] of Object.entries(binds)) {
            try {
              nextVars[name] = sel(expr);
            } catch (e) {
              // Surface unsupported placeholder to logs, but keep going for other binds
              console.warn('[executor] binds selector error:', (e as any)?.message || e);
            }
          }
          s.scratch = { ...(s.scratch || {}), vars: nextVars } as any;
        }
      } catch {}

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
        } catch {}
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
    const undoForEvents: any = undo.map((u) => ({
      stepId: u.stepId,
      tool: u.tool,
      args: toJson(u.args),
    }));
    (events as any).undoEnqueued(s, eventBus, redactForLog(undoForEvents));
  }

  return { output: { ...s.output, commits, undo } };
};
