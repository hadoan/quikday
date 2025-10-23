import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import type { RunEventBus } from '@quikday/libs';
import { registry } from '../registry/registry';
import { events } from '../observability/events';
import { redactForLog } from '../guards/redaction';

// add near top with other imports
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Convert unknown → Json using a safe JSON clone (drops functions/undefined/cycles). */
function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return null;
  }
}

// // ---- Transient error detection ------------------------------------------------
// type TransientLike =
//   | "RATE_LIMIT"
//   | "ETIMEDOUT"
//   | "ECONNRESET"
//   | "EAI_AGAIN"
//   | "ENETUNREACH"
//   | "ECONNABORTED"
//   | "5XX"
//   | "429"
//   | "CIRCUIT_OPEN";

function isTransient(err: any): boolean {
  const code = (err?.code ?? '').toString().toUpperCase();
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  if (code === 'RATE_LIMIT') return true;
  if (code === 'CIRCUIT_OPEN') return true;
  if (['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNABORTED'].includes(code))
    return true;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

// ---- Retry with exponential backoff + jitter ---------------------------------
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

// ---- Derive undo args (delegates to tool if provided) ------------------------
async function deriveUndoArgs(tool: any, result: any, args: any) {
  if (typeof tool.undo === 'function') {
    try {
      return await tool.undo({ result, args });
    } catch {
      // fall through to pass-through on undo derivation failure
    }
  }
  return args;
}

// ---- Executor node -----------------------------------------------------------
export const executor: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const commits: Array<{ stepId: string; result: unknown }> = [];
  const undo: Array<{ stepId: string; tool: string; args: unknown }> = [];

  for (const step of s.scratch?.plan ?? []) {
    const tool = registry.get(step.tool);

    // Safer parse (surface zod issues nicely)
    const parsed = tool.in.safeParse(step.args);
    if (!parsed.success) {
      const zerr = parsed.error?.flatten?.() ?? parsed.error;
      const err: any = new Error(`Invalid args for ${step.tool}`);
      err.code = 'E_ARGS_INVALID';
      err.details = zerr;
      events.toolFailed(s, eventBus, step.tool, { code: err.code, details: zerr });
      (s as any).error = { node: 'executor', message: err.message, code: err.code };
      throw err;
    }
    const args = parsed.data;

    // Redact args for event emission
    const safeArgs = redactForLog(args);

    events.toolCalled(s, eventBus, step.tool, safeArgs);
    const t0 = globalThis.performance?.now?.() ?? Date.now();

    try {
      const result = await withRetry(async () => registry.call(step.tool, args, s.ctx), {
        retries: 3,
        baseMs: 500,
        maxMs: 5000,
      });

      const duration = (globalThis.performance?.now?.() ?? Date.now()) - t0;
      // Redact result for events
      const safeResult = redactForLog(result as any);
      events.toolSucceeded(s, eventBus, step.tool, safeResult, duration);

      commits.push({ stepId: step.id, result });

      if (tool.undo) {
        const uArgs = await deriveUndoArgs(tool, result, args);
        undo.push({ stepId: step.id, tool: step.tool, args: uArgs });
      }
    } catch (error: any) {
      // Prepare structured error payload for events
      const payload = {
        code: (error?.code ?? 'E_STEP_FAILED') as string,
        message: error?.message ?? String(error),
        status: error?.status ?? error?.response?.status,
      };
      events.toolFailed(s, eventBus, step.tool, payload);
      (s as any).error = { node: 'executor', ...payload };
      throw error;
    }
  }

  // Optional: broadcast undo queue if any (your events impl may already have this)
  if (undo.length > 0 && (events as any).undoEnqueued) {
    // Build a JSON-safe clone for event emission
    const undoForEvents: Json = undo.map((u) => ({
      stepId: u.stepId,
      tool: u.tool,
      args: toJson(u.args),
    })) as Json;
    (events as any).undoEnqueued(s, eventBus, redactForLog(undoForEvents));
  }

  return { output: { ...s.output, commits, undo } };
};
