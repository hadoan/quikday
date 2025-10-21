import { EventEmitter } from 'node:events';
import type { Hooks } from '../runtime/graph';
import type { RunState } from '../state/types.js';
import { redactForLog } from '../guards/redaction.js';

/** ─────────────────────────────────────────────────────────────────────────────
 * Event types & payloads
 * ──────────────────────────────────────────────────────────────────────────── */
export type RunEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'node.enter'
  | 'node.exit'
  | 'edge.taken'
  | 'tool.called'
  | 'tool.succeeded'
  | 'tool.failed'
  | 'plan.ready'
  | 'fallback'
  | 'approval.awaiting'
  | 'undo.enqueued'
  | 'undo.completed';

export interface RunEvent<T = any> {
  runId: string;
  type: RunEventType;
  at: string; // ISO timestamp
  payload?: T; // JSON-safe, redacted
  traceId?: string;
  userId?: string;
  teamId?: string | undefined;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Minimal event bus (process-local)
 * You can replace this with a shared bus if you want (e.g., Redis pub/sub).
 * ──────────────────────────────────────────────────────────────────────────── */
class RunEventBus {
  private ee = new EventEmitter();

  on(type: RunEventType | '*', listener: (evt: RunEvent) => void) {
    this.ee.on(type, listener);
  }

  off(type: RunEventType | '*', listener: (evt: RunEvent) => void) {
    this.ee.off(type, listener);
  }

  emit(evt: RunEvent) {
    this.ee.emit(evt.type, evt);
    this.ee.emit('*', evt); // wildcard listeners
  }
}

export const bus = new RunEventBus();

/** ─────────────────────────────────────────────────────────────────────────────
 * Sinks (plug these into real infra in your worker/bootstrap)
 * By default they no-op; replace the TODOs with your implementations.
 * ──────────────────────────────────────────────────────────────────────────── */
export type Sinks = {
  persist?: (evt: RunEvent) => Promise<void>; // e.g., Prisma RunEvent create
  broadcast?: (evt: RunEvent) => Promise<void>; // e.g., WS publish
  webhook?: (evt: RunEvent) => Promise<void>; // e.g., signed webhook sender
  console?: (evt: RunEvent) => void; // local dev logging
};

const defaultSinks: Required<Sinks> = {
  persist: async () => {},
  broadcast: async () => {},
  webhook: async () => {},
  console: (evt) => {
    // Lightweight dev log
    if (process.env.NODE_ENV !== 'production') {
      // keep it short
      console.log(`[${evt.type}] run=${evt.runId}`, JSON.stringify(evt.payload ?? {}));
    }
  },
};

/** ─────────────────────────────────────────────────────────────────────────────
 * Hook factory used by Graph: logs node enter/exit and edges.
 * Call this once per run with the sinks you want.
 * ──────────────────────────────────────────────────────────────────────────── */
export function hooks(
  sinks: Sinks = {},
  redactionOpts?: Parameters<typeof redactForLog>[1],
): Hooks<RunState> {
  const out = { ...defaultSinks, ...sinks };

  function emit(type: RunEventType, s: RunState, payload?: any) {
    const evt: RunEvent = {
      runId: s.ctx.runId,
      type,
      at: new Date().toISOString(),
      payload: payload ? redactForLog(payload, redactionOpts) : undefined,
      traceId: s.ctx.traceId,
      userId: s.ctx.userId,
      teamId: s.ctx.teamId,
    };
    bus.emit(evt);
    out.console(evt);
    // fire-and-forget; don't block the graph
    void out.persist(evt);
    void out.broadcast(evt);
    // webhook only for externally interesting events
    if (
      type === 'run.started' ||
      type === 'run.completed' ||
      type === 'run.failed' ||
      type === 'fallback'
    ) {
      void out.webhook(evt);
    }
  }

  return {
    onEnter: (id, s) => emit('node.enter', s, { node: id }),
    onExit: (id, s, delta) => emit('node.exit', s, { node: id, delta }),
    onEdge: (from, to, s) => emit('edge.taken', s, { from, to }),
  };
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Convenience emitters for non-hook moments (run start/end, tools, etc.)
 * Use these from your worker/registry/planner nodes.
 * ──────────────────────────────────────────────────────────────────────────── */
export const events = {
  runStarted: (s: RunState) => _emit('run.started', s),
  runCompleted: (s: RunState) => _emit('run.completed', s, s.output),
  runFailed: (s: RunState, error: { message: string; code?: string }) =>
    _emit('run.failed', s, error),
  planReady: (s: RunState, plan: any, diff?: any) => _emit('plan.ready', s, { plan, diff }),
  fallback: (s: RunState, reason: string, details?: any) =>
    _emit('fallback', s, { reason, details }),
  toolCalled: (s: RunState, name: string, args?: any) => _emit('tool.called', s, { name, args }),
  toolSucceeded: (s: RunState, name: string, result?: any, ms?: number) =>
    _emit('tool.succeeded', s, { name, result, ms }),
  toolFailed: (s: RunState, name: string, error: any) => _emit('tool.failed', s, { name, error }),
  approvalAwaiting: (s: RunState, steps: any[]) => _emit('approval.awaiting', s, { steps }),
  undoEnqueued: (s: RunState, actions: any[]) => _emit('undo.enqueued', s, { actions }),
  undoCompleted: (s: RunState) => _emit('undo.completed', s),
};

let globalSinks: Sinks = defaultSinks;

/** Initialize sinks once in worker bootstrap (optional but recommended). */
export function initEventSinks(sinks: Sinks) {
  globalSinks = { ...defaultSinks, ...sinks };
}

function _emit(type: RunEventType, s: RunState, payload?: any) {
  const evt: RunEvent = {
    runId: s.ctx.runId,
    type,
    at: new Date().toISOString(),
    payload: payload ? redactForLog(payload) : undefined,
    traceId: s.ctx.traceId,
    userId: s.ctx.userId,
    teamId: s.ctx.teamId,
  };
  bus.emit(evt);
  globalSinks.console?.(evt);
  void globalSinks.persist?.(evt);
  void globalSinks.broadcast?.(evt);
  if (
    type === 'run.started' ||
    type === 'run.completed' ||
    type === 'run.failed' ||
    type === 'fallback'
  ) {
    void globalSinks.webhook?.(evt);
  }
}
