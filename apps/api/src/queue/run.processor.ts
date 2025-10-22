import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { RunsService } from '../runs/runs.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ErrorCode } from '@quikday/types';
import { RedisPubSubService } from '@quikday/libs';
import type { RunState } from '@quikday/agent/state/types';
import type { Run } from '@prisma/client';
import { setRedisPubSub, subscribeToRunEvents, type RunEvent as GraphRunEvent } from '@quikday/agent/observability/events';
import type { RunEvent as UiRunEvent } from '../redis/redis-pubsub.service';
import { AgentService } from '@quikday/agent/nest';

const GRAPH_HALT_AWAITING_APPROVAL = 'GRAPH_HALT_AWAITING_APPROVAL';

type RunJobData = {
  runId: string;
  mode?: string;
  input?: RunState['input'];
  scopes?: string[];
  token?: string;
  meta?: Record<string, unknown>;
  policy?: Record<string, unknown> | null;
};

type StepLogEntry = {
  tool: string;
  action: string;
  status: 'started' | 'succeeded' | 'failed';
  request?: unknown;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  ms?: number;
};

@Processor('runs')
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(
    private runs: RunsService,
    private telemetry: TelemetryService,
    private redisPubSub: RedisPubSubService,
    private agent: AgentService
  ) {
    super();
    // Initialize Redis pub/sub for agent events
    setRedisPubSub(redisPubSub);
  }
  async process(job: Job<RunJobData>) {
    const jobRunId = job.data?.runId;
    if (!jobRunId) {
      this.logger.error('❌ Job missing runId', { jobId: job.id, attemptsMade: job.attemptsMade });
      return;
    }

    this.logger.log('🎬 Job picked up from queue', {
      timestamp: new Date().toISOString(),
      jobId: job.id,
      runId: jobRunId,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
    });

    this.logger.log('📖 Fetching run details from database', { timestamp: new Date().toISOString(), runId: jobRunId });
    const run = await this.runs.get(jobRunId);

    // mark running and notify
    await this.runs.updateStatus(run.id, 'running');
    await this.redisPubSub.publishRunEvent(run.id, { type: 'run_status', payload: { status: 'running' } });

    this.logger.log('▶️ Starting run execution', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      prompt: run.prompt.substring(0, 50) + (run.prompt.length > 50 ? '...' : ''),
      mode: run.mode,
      userId: run.userId,
      teamId: run.teamId,
    });

    // Build runtime input + ctx
    const { initialState, publishRunEvent, safePublish } = this.buildInputAndCtx(run, job);

    // prepare runtime helpers
    const graph = this.agent.createGraph();

    const stepLogs: StepLogEntry[] = [];

    const applyDelta = this.applyDelta;
    const markStep = (tool: string, status: 'succeeded' | 'failed', updater?: (entry: StepLogEntry) => void) =>
      this.markStep(stepLogs, tool, status, updater);
    const formatLogsForPersistence = () => this.formatLogsForPersistence(stepLogs);

    // mutable refs for handlers
    let liveState: RunState = structuredClone(initialState);
    let graphEmittedRunCompleted = false;

    const handleGraphEvent = this.createGraphEventHandler({
      run,
      liveStateRef: { get: () => liveState, set: (s: RunState) => (liveState = s) },
      markStep,
      applyDelta,
      safePublish,
      stepLogs,
      setGraphEmitted: (v: boolean) => (graphEmittedRunCompleted = v),
    });

    try {
      this.logger.log('🧠 Initialising LangGraph run state', { timestamp: new Date().toISOString(), runId: run.id });

      const unsubscribe = subscribeToRunEvents(run.id, handleGraphEvent);
      let final: RunState;
      try {
        final = await graph.run('classify', initialState);
      } finally {
        unsubscribe();
      }

      liveState = final;

      // persist + finalize
      await this.runs.persistResult(run.id, { output: final.output, logs: formatLogsForPersistence() });
      await this.runs.updateStatus(run.id, 'done');

      if (!graphEmittedRunCompleted) {
        await publishRunEvent('run_completed', { status: 'done', output: final.output ?? {} });
      }

      this.logger.log('✅ Job completed successfully', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        runId: run.id,
        totalDuration: Date.now() - (job.processedOn || Date.now()),
      });

      await this.telemetry.track('run_completed', { runId: run.id, status: 'done' });
    } catch (err: any) {
      await this.handleExecutionError({ err, run, liveState, formatLogsForPersistence, job, publishRunEvent: publishRunEvent.bind(this) });
    }
  }

  private buildInputAndCtx(run: Run & Record<string, any>, job: Job<RunJobData>) {
    const config: Record<string, unknown> = run.config && typeof run.config === 'object' ? { ...(run.config as Record<string, unknown>) } : {};
    const configInput = (config.input as RunState['input']) ?? undefined;
    const jobInput = (job.data.input ?? {}) as Partial<RunState['input']>;
    const input: RunState['input'] = {
      prompt:
        typeof jobInput.prompt === 'string' && jobInput.prompt.trim().length > 0
          ? jobInput.prompt
          : typeof configInput?.prompt === 'string' && configInput.prompt.trim().length > 0
          ? configInput.prompt
          : run.prompt,
      messages: jobInput.messages ?? configInput?.messages ?? undefined,
      attachments: (jobInput as any)?.attachments ?? (configInput as any)?.attachments ?? undefined,
    };

    const scopes = new Set<string>(['runs:execute']);
    if (Array.isArray(job.data.scopes)) {
      job.data.scopes.filter((scope): scope is string => typeof scope === 'string').forEach((scope: string) => scopes.add(scope));
    }
    const runAny = run as any;
    if (Array.isArray(runAny?.scopes)) {
      runAny.scopes.filter((scope: unknown): scope is string => typeof scope === 'string').forEach((scope: string) => scopes.add(scope));
    }
    if (Array.isArray(runAny?.RunScopedKeys)) {
      for (const scopedKey of runAny.RunScopedKeys) {
        if (scopedKey?.scope) scopes.add(String(scopedKey.scope));
      }
    }

    const meta = {
      ...(config.meta && typeof config.meta === 'object' ? (config.meta as Record<string, unknown>) : {}),
      ...(job.data.meta ?? {}),
    };

    if (Array.isArray(config.approvedSteps) && !Array.isArray(meta.approvedSteps)) {
      meta.approvedSteps = config.approvedSteps;
    }
    if (!meta.channelTargets && config.channelTargets) {
      meta.channelTargets = config.channelTargets;
    }
    if (!meta.policy) {
      meta.policy = job.data.policy ?? run.policySnapshot ?? undefined;
    }
    if (job.data.token) {
      meta.runToken = job.data.token;
    }

    const tz = (typeof meta.tz === 'string' && meta.tz.trim().length > 0 ? (meta.tz as string) : typeof meta.timezone === 'string' && meta.timezone.trim().length > 0 ? (meta.timezone as string) : 'Europe/Berlin') ?? 'Europe/Berlin';
    meta.tz = tz;
    meta.jobId = job.id;

    const ctx: RunState['ctx'] & { meta: Record<string, unknown> } = {
      runId: run.id,
      userId: String(run.userId),
      teamId: run.teamId ? String(run.teamId) : undefined,
      scopes: Array.from(scopes),
      traceId: typeof meta.traceId === 'string' && meta.traceId.trim().length > 0 ? (meta.traceId as string) : `run:${run.id}`,
      tz,
      now: new Date(),
      meta,
    };

    const initialState: RunState = {
      input,
      mode: (job.data.mode ?? run.mode)?.toUpperCase() === 'AUTO' ? 'AUTO' : 'PLAN',
      ctx,
      scratch: {},
      output: {},
    };

    const publishRunEvent = (type: UiRunEvent['type'], payload: UiRunEvent['payload']) =>
      this.redisPubSub.publishRunEvent(run.id, { type, payload });

    const safePublish = (type: UiRunEvent['type'], payload: UiRunEvent['payload']) =>
      void publishRunEvent(type, payload).catch((publishErr) =>
        this.logger.error('❌ Failed to publish run event', { runId: run.id, type, error: publishErr?.message ?? publishErr })
      );

    return { initialState, publishRunEvent, safePublish };
  }

  /**
   * Apply a "delta" object onto `target` in-place.
   *
   * - Merges nested objects recursively.
   * - Replaces arrays (array items that are objects are cloned with structuredClone).
   * - Overwrites primitives.
   *
   * Example:
   * const target = { a: 1, b: { x: 2 }, c: [{ id: 1 }] };
   * applyDelta(target, { b: { y: 3 }, c: [{ id: 2 }], d: 'new' });
   * // => target becomes { a: 1, b: { x: 2, y: 3 }, c: [{ id: 2 }], d: 'new' }
   *
   * Note: this mutates `target`. If you need an immutable merge, clone first.
   */
  private applyDelta(target: any, delta: any) {
    if (!delta || typeof delta !== 'object') return;
    for (const [key, value] of Object.entries(delta)) {
      if (Array.isArray(value)) {
        target[key] = value.map((item) => (typeof item === 'object' && item !== null ? structuredClone(item) : item));
        continue;
      }
      if (value && typeof value === 'object') {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.applyDelta(target[key], value);
        continue;
      }
      target[key] = value;
    }
  }

  private markStep(stepLogs: StepLogEntry[], tool: string, status: 'succeeded' | 'failed', updater?: (entry: StepLogEntry) => void) {
    for (let i = stepLogs.length - 1; i >= 0; i--) {
      const entry = stepLogs[i];
      if (entry.tool === tool && entry.status === 'started') {
        entry.status = status;
        entry.completedAt = new Date().toISOString();
        updater?.(entry);
        return;
      }
    }
  }

  private formatLogsForPersistence(stepLogs: StepLogEntry[]) {
    return stepLogs.map((entry) => ({
      tool: entry.tool,
      action: entry.action,
      request: entry.request,
      result: entry.result,
      errorCode: entry.status === 'failed' ? entry.errorCode ?? ErrorCode.E_STEP_FAILED : entry.errorCode,
      errorMessage: entry.errorMessage,
      status: entry.status,
      ts: entry.startedAt,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      ms: entry.ms,
    }));
  }

  private createGraphEventHandler(opts: {
    run: any;
    liveStateRef: { get: () => RunState; set: (s: RunState) => void };
    markStep: (tool: string, status: 'succeeded' | 'failed', updater?: (entry: StepLogEntry) => void) => void;
    applyDelta: (target: any, delta: any) => void;
    safePublish: (type: UiRunEvent['type'], payload: UiRunEvent['payload']) => void;
    stepLogs: StepLogEntry[];
    setGraphEmitted: (v: boolean) => void;
  }) {
    const { run, liveStateRef, markStep, applyDelta, safePublish, stepLogs, setGraphEmitted } = opts;

    return (evt: GraphRunEvent) => {
      if (evt.runId !== run.id) return;
      try {
        switch (evt.type) {
          case 'node.enter': {
            const node = (evt.payload as any)?.node;
            if (node === 'planner') safePublish('run_status', { status: 'planning' });
            if (node === 'executor') safePublish('run_status', { status: 'executing' });
            break;
          }
          case 'node.exit': {
            const delta = (evt.payload as any)?.delta;
            if (delta) applyDelta(liveStateRef.get(), delta);
            break;
          }
          case 'run_status': {
            this.logger.log('▶️ LangGraph run started', { runId: run.id });
            safePublish('run_status', { status: 'running' });
            break;
          }
          case 'plan.ready': {
            const plan = Array.isArray((evt.payload as any)?.plan) ? ((evt.payload as any).plan as any[]) : [];
            const diff = (evt.payload as any)?.diff;
            this.logger.log('📋 Plan ready', { runId: run.id, steps: plan.length });
            safePublish('plan_generated', {
              intent: liveStateRef.get().scratch?.intent,
              plan,
              tools: plan.map((step: any) => step.tool),
              actions: plan.map((step: any) => `Execute ${step.tool}`),
              diff,
            });
            break;
          }
          case 'tool.called': {
            const name = (evt.payload as any)?.name ?? 'unknown';
            const args = (evt.payload as any)?.args;
            const startedAt = new Date().toISOString();
            this.logger.log('🔧 Tool started', { runId: run.id, tool: name });
            stepLogs.push({ tool: name, action: `Executing ${name}`, request: args, status: 'started', startedAt });
            safePublish('step_started', { tool: name, action: `Executing ${name}`, request: args });
            break;
          }
          case 'tool.succeeded': {
            const name = (evt.payload as any)?.name ?? 'unknown';
            const result = (evt.payload as any)?.result;
            const ms = (evt.payload as any)?.ms;
            this.logger.log('✅ Tool succeeded', { runId: run.id, tool: name, durationMs: ms });
            markStep(name, 'succeeded', (entry) => {
              entry.result = result;
              entry.ms = typeof ms === 'number' ? ms : undefined;
              entry.action = `Completed ${name}`;
            });
            safePublish('step_succeeded', { tool: name, action: `Completed ${name}`, response: result, ms });
            void this.telemetry.track('step_succeeded', { runId: run.id, tool: name }).catch(() => undefined);
            break;
          }
          case 'tool.failed': {
            const name = (evt.payload as any)?.name ?? 'unknown';
            const error = (evt.payload as any)?.error;
            this.logger.error('❌ Tool failed', { runId: run.id, tool: name, error });
            markStep(name, 'failed', (entry) => {
              entry.errorCode = (error?.code as string) ?? ErrorCode.E_STEP_FAILED;
              entry.errorMessage = error?.message as string | undefined;
              entry.action = `Failed ${name}`;
            });
            safePublish('step_failed', { tool: name, error });
            void this.telemetry
              .track('step_failed', { runId: run.id, tool: name, errorCode: (error?.code as string) ?? ErrorCode.E_STEP_FAILED })
              .catch(() => undefined);
            break;
          }
          case 'approval.awaiting': {
            const approvalId = (evt.payload as any)?.approvalId;
            this.logger.log('⏸️ Awaiting approval', { runId: run.id, approvalId });
            safePublish('run_status', { status: 'awaiting_approval', approvalId });
            break;
          }
          case 'fallback': {
            const reason = (evt.payload as any)?.reason ?? 'unspecified';
            const details = (evt.payload as any)?.details;
            this.logger.warn('⚠️ Run fell back', { runId: run.id, reason, details });
            safePublish('run_status', { status: 'fallback', reason, details });
            break;
          }
          case 'run_completed': {
            setGraphEmitted(true);
            const output = evt.payload ?? liveStateRef.get().output ?? {};
            this.logger.log('🎉 LangGraph run completed event', { runId: run.id });
            safePublish('run_completed', { status: 'done', output });
            break;
          }
          case 'step_failed': {
            const error = evt.payload;
            this.logger.error('🔴 LangGraph run failed event', { runId: run.id, error });
            safePublish('run_status', { status: 'failed', error });
            break;
          }
          default:
            break;
        }
      } catch (handlerErr) {
        this.logger.error('❌ Failed to handle LangGraph event', {
          runId: run.id,
          eventType: evt.type,
          error: handlerErr instanceof Error ? handlerErr.message : handlerErr,
        });
      }
    };
  }

  private async handleExecutionError(opts: {
    err: any;
    run: any;
    liveState: RunState;
    formatLogsForPersistence: () => any[];
    job: Job<RunJobData>;
    publishRunEvent: (type: UiRunEvent['type'], payload: UiRunEvent['payload']) => Promise<void>;
  }) {
    const { err, run, liveState, formatLogsForPersistence, job, publishRunEvent } = opts;
    this.logger.error('❌ Job execution failed', { timestamp: new Date().toISOString(), jobId: job.id, runId: run.id, error: err?.message, errorCode: err?.code });

    const isApprovalHalt = err?.code === GRAPH_HALT_AWAITING_APPROVAL || err?.name === GRAPH_HALT_AWAITING_APPROVAL || err?.message === GRAPH_HALT_AWAITING_APPROVAL;

    if (isApprovalHalt) {
      const approvalId = err?.approvalId ?? err?.payload?.approvalId ?? err?.data?.approvalId ?? undefined;
      await this.runs.persistResult(run.id, { output: liveState.output, logs: formatLogsForPersistence() });
      await this.runs.updateStatus(run.id, 'awaiting_approval');
      this.logger.log('⏸️ Run awaiting approval', approvalId ? { runId: run.id, approvalId } : { runId: run.id });
      await this.redisPubSub.publishRunEvent(run.id, { type: 'run_status', payload: approvalId ? { status: 'awaiting_approval', approvalId } : { status: 'awaiting_approval' } });
      return;
    }

    const errorPayload = { message: err?.message ?? 'run failed', code: err?.code ?? ErrorCode.E_PLAN_FAILED };
    this.logger.log('💾 Persisting error result', { timestamp: new Date().toISOString(), runId: run.id, errorCode: errorPayload.code });
    await this.runs.persistResult(run.id, { error: errorPayload, logs: formatLogsForPersistence() });
    await this.runs.updateStatus(run.id, 'failed');
    await this.redisPubSub.publishRunEvent(run.id, { type: 'run_status', payload: { status: 'failed', error: errorPayload } });
    await this.telemetry.track('run_completed', { runId: run.id, status: 'failed', errorCode: errorPayload.code });
    this.logger.error('🔴 Job marked as failed', { timestamp: new Date().toISOString(), jobId: job.id, runId: run.id });
    throw err;
  }
}
