import type { Hooks } from '../runtime/graph';
import type { RunState } from '../state/types';
import { redactForLog } from '../guards/redaction';
import type { RedisPubSubService, RunEventBus } from '@quikday/libs';
import type { PubSubChannel } from '@quikday/libs';
import { CHANNEL_WORKER } from '@quikday/libs';

/** ─────────────────────────────────────────────────────────────────────────────
 * Event types & payloads
 * ──────────────────────────────────────────────────────────────────────────── */
export type RunEventType =
  | 'run_status'
  | 'run_completed'
  | 'assistant.delta'
  | 'assistant.final'
  | 'step_started'
  | 'step_succeeded'
  | 'step_failed'
  | 'plan_generated'
  | 'connection_established'
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
  | 'undo.completed'
  | 'awaiting.input';

export interface RunEvent<T = any> {
  runId: string;
  type: RunEventType;
  ts: string; // ISO timestamp
  payload?: T; // JSON-safe, redacted
  traceId?: string;
  userId?: string;
  teamId?: string | undefined;
}

// /** ─────────────────────────────────────────────────────────────────────────────
//  * Redis pub/sub integration
//  * Uses the shared RedisPubSubService from @quikday/libs
//  * ──────────────────────────────────────────────────────────────────────────── */
// let redisPubSub: RedisPubSubService | null = null;

// /**
//  * Initialize the Redis pub/sub service for event broadcasting.
//  * Call this once during application bootstrap.
//  */
// export function setRedisPubSub(service: RedisPubSubService) {
//   redisPubSub = service;
// }

/**
 * Subscribe to events for a specific run using Redis pub/sub
 */
export function subscribeToRunEvents(
  runId: string,
  handler: (evt: RunEvent) => void,
  eventBus: RunEventBus,
  channel: PubSubChannel,
  label?: string,
): () => void {
  // Pass channel and optional label through to the underlying RunEventBus so
  // subscribers can be identified and segregated by channel.
  return eventBus.on(runId, handler as any, channel, { label });
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sinks (plug these into real infra in your worker/bootstrap)
 * By default they no-op; replace the TODOs with your implementations.
 * ──────────────────────────────────────────────────────────────────────────── */
export type Sinks = {
  persist?: (evt: RunEvent) => Promise<void>; // e.g., Prisma RunEvent create
  webhook?: (evt: RunEvent) => Promise<void>; // e.g., signed webhook sender
  console?: (evt: RunEvent) => void; // local dev logging
};

const defaultSinks: Required<Sinks> = {
  persist: async () => {},
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
  eventBus: RunEventBus,
  sinks: Sinks = {},
  redactionOpts?: Parameters<typeof redactForLog>[1],
): Hooks<RunState> {
  const out = { ...defaultSinks, ...sinks };

  function emit(type: RunEventType, s: RunState, payload?: any) {
    const evt: RunEvent = {
      runId: s.ctx.runId,
      type,
      ts: new Date().toISOString(),
      payload: payload ? redactForLog(payload, redactionOpts) : undefined,
      traceId: s.ctx.traceId,
      userId: s.ctx.userId,
      teamId: s.ctx.teamId,
    };

    // Broadcast via Redis pub/sub
    // Graph hooks are intended for the worker to consume.
    eventBus.publish(
      s.ctx.runId,
      {
        type: evt.type,
        payload: evt.payload,
      },
      CHANNEL_WORKER,
    );

    out.console(evt);
    // fire-and-forget; don't block the graph
    void out.persist(evt);
    // webhook only for externally interesting events
    if (
      type === 'run_status' ||
      type === 'run_completed' ||
      type === 'step_failed' ||
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
  runStarted: (s: RunState, eventBus: RunEventBus) =>
    _emit('run_status', s, eventBus, { status: 'started' }),
  runCompleted: (s: RunState, eventBus: RunEventBus) =>
    _emit('run_completed', s, eventBus, s.output),
  runFailed: (s: RunState, eventBus: RunEventBus, error: { message: string; code?: string }) =>
    _emit('step_failed', s, eventBus, error),
  planReady: (s: RunState, eventBus: RunEventBus, plan: any, diff?: any) =>
    _emit('plan_generated', s, eventBus, { plan, diff }),
  fallback: (s: RunState, eventBus: RunEventBus, reason: string, details?: any) =>
    _emit('fallback', s, eventBus, { reason, details }),
  // Include optional stepId so downstream subscribers (UI/websocket) can map
  // assistant messages and tool events to the originating step.
  toolCalled: (
    s: RunState,
    eventBus: RunEventBus,
    name: string,
    args?: any,
    stepId?: string,
  ) => _emit('tool.called', s, eventBus, { name, args, stepId }),
  toolSucceeded: (
    s: RunState,
    eventBus: RunEventBus,
    name: string,
    result?: any,
    ms?: number,
    stepId?: string,
  ) => _emit('tool.succeeded', s, eventBus, { name, result, ms, stepId }),
  toolFailed: (
    s: RunState,
    eventBus: RunEventBus,
    name: string,
    error: any,
    stepId?: string,
  ) => _emit('tool.failed', s, eventBus, { name, error, stepId }),
  approvalAwaiting: (s: RunState, eventBus: RunEventBus, steps: any[]) =>
    _emit('approval.awaiting', s, eventBus, { steps }),
  undoEnqueued: (s: RunState, eventBus: RunEventBus, actions: any[]) =>
    _emit('undo.enqueued', s, eventBus, { actions }),
  undoCompleted: (s: RunState, eventBus: RunEventBus) => _emit('undo.completed', s, eventBus),
  awaitingInput: (s, bus, questions: Array<{ key: string; question: string }>) =>
    _emit('awaiting.input', s, bus, { questions }),
};

let globalSinks: Sinks = defaultSinks;

/** Initialize sinks once in worker bootstrap (optional but recommended). */
export function initEventSinks(sinks: Sinks) {
  globalSinks = { ...defaultSinks, ...sinks };
}

function _emit(type: RunEventType, s: RunState, eventBus: RunEventBus, payload?: any) {
  const evt: RunEvent = {
    runId: s.ctx.runId,
    type,
    ts: new Date().toISOString(),
    payload: payload ? redactForLog(payload) : undefined,
    traceId: s.ctx.traceId,
    userId: s.ctx.userId,
    teamId: s.ctx.teamId,
  };

  // Convenience emitters publish to the worker channel by default so the
  // worker process can consume graph events.
  eventBus.publish(
    s.ctx.runId,
    {
      type: evt.type,
      payload: evt.payload,
    },
    CHANNEL_WORKER,
  );

  globalSinks.console?.(evt);
  void globalSinks.persist?.(evt);
  if (
    type === 'run_status' ||
    type === 'run_completed' ||
    type === 'step_failed' ||
    type === 'fallback'
  ) {
    void globalSinks.webhook?.(evt);
  }
}
