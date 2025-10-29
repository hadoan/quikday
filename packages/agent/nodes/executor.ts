// packages/agent/nodes/executor.ts
import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import type { RunEventBus } from '@quikday/libs';
import { CHANNEL_WEBSOCKET } from '@quikday/libs';
import { registry } from '../registry/registry';
import { events } from '../observability/events';
import { redactForLog } from '../guards/redaction';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

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

/** ────────────────────────────────────────────────────────────────────────────
 * Executor node
 * - Runs each planned step.
 * - For chat.respond: always produce an assistant message (never route to fallback).
 * - Other tools: original behavior (retry, error → set s.error so graph can route).
 * ─────────────────────────────────────────────────────────────────────────── */
export const executor: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const commits: Array<{ stepId: string; result: unknown }> = [];
  const undo: Array<{ stepId: string; tool: string; args: unknown }> = [];

  for (const step of s.scratch?.plan ?? []) {
    const isChat = step.tool === 'chat.respond';
    const tool = registry.get(step.tool);

    // Parse args
    let args: any = step.args ?? {};
    if (isChat) {
      // Try tool schema if available; otherwise accept as-is for resilience
      try {
        if (tool?.in) {
          const parsed = tool.in.safeParse(step.args);
          if (parsed.success) args = parsed.data;
        }
      } catch {
        // ignore schema issues for chat.respond
      }
    } else {
      // Strict for non-chat tools
      const parsed = tool.in.safeParse(step.args);
      if (!parsed.success) {
        const zerr = parsed.error?.flatten?.() ?? parsed.error;
        const err: any = new Error(`Invalid args for ${step.tool}`);
        err.code = 'E_ARGS_INVALID';
        err.details = zerr;
        events.toolFailed(s, eventBus, step.tool, { code: err.code, details: zerr }, step.id);
        (s as any).error = { node: 'executor', message: err.message, code: err.code };
        throw err;
      }
      args = parsed.data;
    }

    // Emit "called" (suppress for chat.respond to avoid Execution Log)
    if (!isChat) {
      const safeArgs = redactForLog(args);
      events.toolCalled(s, eventBus, step.tool, safeArgs, step.id);
    }

    const t0 = globalThis.performance?.now?.() ?? Date.now();

    try {
      const result = await withRetry(() => registry.call(step.tool, args, s.ctx), {
        retries: 3,
        baseMs: 500,
        maxMs: 5_000,
      });

      const duration = (globalThis.performance?.now?.() ?? Date.now()) - t0;

      // Emit success (suppress for chat.respond to avoid Execution Log)
      if (!isChat) {
        const safeResult = redactForLog(result as any);
        events.toolSucceeded(s, eventBus, step.tool, safeResult, duration, step.id);
      }

      // Persist commit
      commits.push({ stepId: step.id, result });

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
              payload: { stepId: step.id, text, ts: new Date().toISOString() },
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
        undo.push({ stepId: step.id, tool: step.tool, args: uArgs });
      }
    } catch (error: any) {

      // Non-chat tools keep failure semantics (graph may route to fallback)
      const payload = {
        code: (error?.code ?? 'E_STEP_FAILED') as string,
        message: error?.message ?? String(error),
        status: error?.status ?? error?.response?.status,
      };
      events.toolFailed(s, eventBus, step.tool, payload, step.id);
      (s as any).error = { node: 'executor', ...payload };
      throw error;
    }
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
