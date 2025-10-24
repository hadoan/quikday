import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { RunsService } from '../runs/runs.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ErrorCode } from '@quikday/types';
import { RedisPubSubService } from '@quikday/libs';
import type { RunState } from '@quikday/agent/state/types';
import type { Run } from '@prisma/client';
import {
  subscribeToRunEvents,
  type RunEvent as GraphRunEvent,
} from '@quikday/agent/observability/events';
import { CHANNEL_WORKER, CHANNEL_WEBSOCKET } from '@quikday/libs';
import type { RunEvent as UiRunEvent } from '@quikday/libs/redis/RunEvent';
import { AgentService } from '../agent';
import { InMemoryEventBus } from '@quikday/libs';
import { RunEventBus } from '@quikday/libs/pubsub/event-bus';
import { createGraphEventHandler } from './create-graph-event-handler';

const GRAPH_HALT_AWAITING_APPROVAL = 'GRAPH_HALT_AWAITING_APPROVAL';

type RunJobData = {
  runId: string;
  mode?: string;
  input?: RunState['input'];
  scopes?: string[];
  token?: string;
  meta?: Record<string, unknown>;
  policy?: Record<string, unknown> | null;
  scratch?: Record<string, unknown> | undefined;
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
    // private redisPubSub: RedisPubSubService,
    private agent: AgentService,
    @Inject('RunEventBus') private eventBus: RunEventBus
  ) {
    super();
    // Initialize Redis pub/sub for agent events
    // setRedisPubSub(redisPubSub);
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

    this.logger.log('📖 Fetching run details from database', {
      timestamp: new Date().toISOString(),
      runId: jobRunId,
    });
    const run = await this.runs.get(jobRunId);

    // mark running and notify
    await this.runs.updateStatus(run.id, 'running');
    await this.eventBus.publish(
      run.id,
      { type: 'run_status', payload: { status: 'running' } },
      CHANNEL_WEBSOCKET
    );

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

    // Bind applyDelta to retain `this` (method uses this.applyDelta for recursion)
    const applyDelta = this.applyDelta.bind(this);
    const markStep = (
      tool: string,
      status: 'succeeded' | 'failed',
      updater?: (entry: StepLogEntry) => void
    ) => this.markStep(stepLogs, tool, status, updater);
    const formatLogsForPersistence = () => this.formatLogsForPersistence(stepLogs);

    // mutable refs for handlers
    let liveState: RunState = structuredClone(initialState);
    let graphEmittedRunCompleted = false;

    const handleGraphEvent = createGraphEventHandler({
      run,
      liveStateRef: { get: () => liveState, set: (s: RunState) => (liveState = s) },
      markStep,
      applyDelta,
      safePublish,
      stepLogs,
      setGraphEmitted: (v: boolean) => (graphEmittedRunCompleted = v),
      logger: this.logger,
      telemetry: this.telemetry,
    });

    try {
      this.logger.log('🧠 Initialising LangGraph run state', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });

      const unsubscribe = subscribeToRunEvents(
        run.id,
        handleGraphEvent,
        this.eventBus,
        CHANNEL_WORKER,
        'worker'
      );
      let final: RunState;
      try {
        final = await graph.run('classify', initialState, this.eventBus);
      } finally {
        unsubscribe();
      }

      liveState = final;

      const awaiting = final?.scratch?.awaiting;
      if (
        awaiting?.reason === 'missing_info' &&
        Array.isArray(awaiting.questions) &&
        awaiting.questions.length > 0
      ) {
        const questions = awaiting.questions ?? (final.output?.diff as any)?.questions ?? [];

        // Persist the awaiting state + questions onto the run output
        await this.runs.persistResult(run.id, {
          output: {
            ...(final.output ?? {}),
            diff: {
              ...(final.output?.diff ?? {}),
              questions,
              // ensure there's a human summary (use existing if present)
              summary:
                final.output?.diff?.summary ??
                `Missing information needed: ${questions.map((q: any) => q.key).join(', ')}`,
            },
            // explicit awaiting marker so we can reliably resume after refresh
            awaiting: { type: 'input', questions },
          } as any,
          logs: formatLogsForPersistence(),
        });
        // Flip status to awaiting_input (do NOT complete the run)
        await this.runs.updateStatus(run.id, 'awaiting_input');
      } else {
        // persist + finalize
        await this.runs.persistResult(run.id, {
          output: final.output,
          logs: formatLogsForPersistence(),
        });
        await this.runs.updateStatus(run.id, 'done');
      }

      // Emit run_completed and include lastAssistant (if any) for UI convenience.
      // Derive last assistant message from commits (reverse find).
      const commits = Array.isArray(final?.output?.commits) ? final.output.commits : [];
      // Prefer assistant message from commits (tool outputs). If none, fall back to
      // the run-level summary (used by the fallback node) so policy_denied / fallback
      // messages are surfaced to the UI as an assistant-like message.
      let lastAssistant: string | null = null;
      const commitWithMessage =
        ([...commits]
          .reverse()
          .find(
            (c: any) => c?.stepId && c?.result && typeof (c?.result as any)?.message === 'string'
          ) as any) || null;
      if (commitWithMessage) {
        lastAssistant = (commitWithMessage.result as any).message as string;
      } else if (final?.output && typeof final.output?.summary === 'string') {
        lastAssistant = final.output.summary as string;
      } else {
        lastAssistant = null;
      }

      if (!graphEmittedRunCompleted) {
        if (final.scratch?.awaiting) {
          return;
        }
        await publishRunEvent('run_completed', {
          status: 'done',
          output: final.output ?? {},
          lastAssistant,
        });
      }

      this.logger.log('✅ Job completed successfully', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        runId: run.id,
        totalDuration: Date.now() - (job.processedOn || Date.now()),
      });

      await this.telemetry.track('run_completed', { runId: run.id, status: 'done' });
    } catch (err: any) {
      await this.handleExecutionError({
        err,
        run,
        liveState,
        formatLogsForPersistence,
        job,
        publishRunEvent: publishRunEvent.bind(this),
      });
    }
  }

  private buildInputAndCtx(run: Run & Record<string, any>, job: Job<RunJobData>) {
    const config: Record<string, unknown> =
      run.config && typeof run.config === 'object'
        ? { ...(run.config as Record<string, unknown>) }
        : {};
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
      job.data.scopes
        .filter((scope): scope is string => typeof scope === 'string')
        .forEach((scope: string) => scopes.add(scope));
    }
    const runAny = run as any;
    if (Array.isArray(runAny?.scopes)) {
      runAny.scopes
        .filter((scope: unknown): scope is string => typeof scope === 'string')
        .forEach((scope: string) => scopes.add(scope));
    }
    if (Array.isArray(runAny?.RunScopedKeys)) {
      for (const scopedKey of runAny.RunScopedKeys) {
        if (scopedKey?.scope) scopes.add(String(scopedKey.scope));
      }
    }

    const meta = {
      ...(config.meta && typeof config.meta === 'object'
        ? (config.meta as Record<string, unknown>)
        : {}),
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

    const tz =
      (typeof meta.tz === 'string' && meta.tz.trim().length > 0
        ? (meta.tz as string)
        : typeof meta.timezone === 'string' && meta.timezone.trim().length > 0
          ? (meta.timezone as string)
          : 'Europe/Berlin') ?? 'Europe/Berlin';
    meta.tz = tz;
    meta.jobId = job.id;

    const ctx: RunState['ctx'] & { meta: Record<string, unknown> } = {
      runId: run.id,
      userId: String(run.userId),
      teamId: run.teamId ? String(run.teamId) : undefined,
      scopes: Array.from(scopes),
      traceId:
        typeof meta.traceId === 'string' && meta.traceId.trim().length > 0
          ? (meta.traceId as string)
          : `run:${run.id}`,
      tz,
      now: new Date(),
      meta,
    };

    // Pull whatever is in DB (might be generic JSON)
    const rawOut = (run?.output ?? {}) as Record<string, any>;

    // 1) Move any persisted output.scratch into state.scratch
    const persistedScratch =
      rawOut.scratch && typeof rawOut.scratch === 'object'
        ? (rawOut.scratch as Record<string, unknown>)
        : {};

    // 2) Everything else is considered the "real" output
    const { scratch: _drop, ...restOutput } = rawOut;

    // 3) Build state (job scratch wins over persisted)
    const initialState: RunState = {
      input,
      mode: (job.data.mode ?? run.mode)?.toUpperCase() === 'AUTO' ? 'AUTO' : 'PLAN',
      ctx,
      scratch: {
        ...(persistedScratch as any),
        ...structuredClone((job.data as any)?.scratch ?? {}),
      },
      output: restOutput as RunState['output'], // <- minimal cast after stripping scratch
    };

    const publishRunEvent = (type: UiRunEvent['type'], payload: UiRunEvent['payload']) =>
      this.eventBus.publish(run.id, { type, payload }, CHANNEL_WEBSOCKET);

    const safePublish = (type: UiRunEvent['type'], payload: UiRunEvent['payload']) =>
      void publishRunEvent(type, payload).catch((publishErr) =>
        this.logger.error('❌ Failed to publish run event', {
          runId: run.id,
          type,
          error: publishErr?.message ?? publishErr,
        })
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
        target[key] = value.map((item) =>
          typeof item === 'object' && item !== null ? structuredClone(item) : item
        );
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

  private markStep(
    stepLogs: StepLogEntry[],
    tool: string,
    status: 'succeeded' | 'failed',
    updater?: (entry: StepLogEntry) => void
  ) {
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
      errorCode:
        entry.status === 'failed' ? (entry.errorCode ?? ErrorCode.E_STEP_FAILED) : entry.errorCode,
      errorMessage: entry.errorMessage,
      status: entry.status,
      ts: entry.startedAt,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      ms: entry.ms,
    }));
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
    this.logger.error('❌ Job execution failed', {
      timestamp: new Date().toISOString(),
      jobId: job.id,
      runId: run.id,
      error: err?.message,
      errorCode: err?.code,
    });

    const isApprovalHalt =
      err?.code === GRAPH_HALT_AWAITING_APPROVAL ||
      err?.name === GRAPH_HALT_AWAITING_APPROVAL ||
      err?.message === GRAPH_HALT_AWAITING_APPROVAL;

    if (isApprovalHalt) {
      const approvalId =
        err?.approvalId ?? err?.payload?.approvalId ?? err?.data?.approvalId ?? undefined;
      await this.runs.persistResult(run.id, {
        output: liveState.output,
        logs: formatLogsForPersistence(),
      });
      await this.runs.updateStatus(run.id, 'awaiting_approval');
      this.logger.log(
        '⏸️ Run awaiting approval',
        approvalId ? { runId: run.id, approvalId } : { runId: run.id }
      );
      await this.eventBus.publish(
        run.id,
        {
          type: 'run_status',
          payload: approvalId
            ? { status: 'awaiting_approval', approvalId }
            : { status: 'awaiting_approval' },
        },
        CHANNEL_WEBSOCKET
      );
      return;
    }

    const errorPayload = {
      message: err?.message ?? 'run failed',
      code: err?.code ?? ErrorCode.E_PLAN_FAILED,
    };
    this.logger.log('💾 Persisting error result', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      errorCode: errorPayload.code,
    });
    await this.runs.persistResult(run.id, {
      error: errorPayload,
      logs: formatLogsForPersistence(),
    });
    await this.runs.updateStatus(run.id, 'failed');
    await this.eventBus.publish(
      run.id,
      {
        type: 'run_status',
        payload: { status: 'failed', error: errorPayload },
      },
      CHANNEL_WEBSOCKET
    );
    await this.telemetry.track('run_completed', {
      runId: run.id,
      status: 'failed',
      errorCode: errorPayload.code,
    });
    this.logger.error('🔴 Job marked as failed', {
      timestamp: new Date().toISOString(),
      jobId: job.id,
      runId: run.id,
    });
    throw err;
  }
}
