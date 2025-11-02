// apps/api/src/queue/run.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { RunsService } from '../runs/runs.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ErrorCode } from '@quikday/types';
import type { RunState, RunMode } from '@quikday/agent/state/types';
import type { Run } from '@prisma/client';
import { subscribeToRunEvents } from '@quikday/agent/observability/events';
import { CHANNEL_WORKER, CHANNEL_WEBSOCKET } from '@quikday/libs';
import type { RunEvent as UiRunEvent } from '@quikday/libs/redis/RunEvent';
import { AgentService } from '../agent';
import type { RunEventBus } from '@quikday/libs/pubsub/event-bus';
import { createGraphEventHandler } from './create-graph-event-handler';
import { RunOutcome } from '@quikday/agent/runtime/graph';

import { runWithCurrentUser } from '@quikday/libs';
import type { CurrentUserContext } from '@quikday/types/auth/current-user.types';

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
  __ctx?: CurrentUserContext; // <<< ALS context carrier
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

  /**
   * Map frontend mode strings to backend RunMode format
   */
  private mapRunMode(mode?: string): RunMode {
    const normalized = mode?.toLowerCase();
    switch (normalized) {
      case 'preview':
      case 'plan':
        return 'PREVIEW';
      case 'approval':
        return 'APPROVAL';
      case 'auto':
        return 'AUTO';
      default:
        return 'APPROVAL'; // Default to approval mode for safety
    }
  }

  constructor(
    private runs: RunsService,
    private telemetry: TelemetryService,
    private agent: AgentService,
    @Inject('RunEventBus') private eventBus: RunEventBus
  ) {
    super();
  }

  // Lightweight indicator that the worker is registered
  onModuleInit() {
    this.logger.log('🧵 RunProcessor initialized and awaiting jobs on queue "runs"');
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

    const run = await this.runs.get(jobRunId);

    // Build/restore ALS context for this execution
    const fallbackCtx: CurrentUserContext = {
      userId: String(run.userId),
      teamId: run.teamId ? String(run.teamId) : null,
      scopes: Array.isArray(job.data.scopes) ? job.data.scopes : [],
      traceId:
        typeof job.data?.meta?.['traceId'] === 'string' &&
        (job.data.meta!['traceId'] as string).trim()
          ? (job.data.meta!['traceId'] as string)
          : `run:${run.id}`,
      tz:
        (typeof job.data?.meta?.['tz'] === 'string' && (job.data.meta!['tz'] as string).trim()
          ? (job.data.meta!['tz'] as string)
          : 'Europe/Berlin') ?? 'Europe/Berlin',
      runId: String(run.id),
    };
    const ctx: CurrentUserContext = job.data.__ctx ?? fallbackCtx;

    return runWithCurrentUser(ctx, async () => {
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

      // prepare runtime graph
      const graph = this.agent.createGraph();

      const stepLogs: StepLogEntry[] = [];

      // helpers
      const applyDelta = this.applyDelta.bind(this);
      const markStep = (
        tool: string,
        status: 'succeeded' | 'failed',
        updater?: (entry: StepLogEntry) => void
      ) => this.markStep(stepLogs, tool, status, updater);
      const formatLogsForPersistence = () => this.formatLogsForPersistence(stepLogs);

      // mutable state mirror for event handlers
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
        persistPlanSteps: async (plan: any[], diff: any) => {
          try {
            await this.runs.persistPlan(run.id, plan, diff);
          } catch (e) {
            this.logger.error('? Failed to persist plan', {
              runId: run.id,
              error: (e as any)?.message ?? String(e),
            });
          }
        },
      });

      try {
        this.logger.log('🧠 Initialising graph run state', {
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
          // Check if we're resuming from a specific node (e.g., after approval)
          const config = run.config as any;
          const resumeFrom = config?.resumeFrom as string | undefined;
          
          if (resumeFrom === 'executor' && run.status === 'approved') {
            // Resume execution from executor node after approval
            this.logger.log('▶️ Resuming from executor after approval', {
              runId: run.id,
              approvedSteps: config?.approvedSteps?.length || 0,
            });
            
            // Run from executor directly, bypassing planner
            final = await graph.run('executor', initialState, this.eventBus);
          } else {
            // Normal flow: start from classify
            final = await graph.run('classify', initialState, this.eventBus);
          }
        } finally {
          unsubscribe();
        }
        liveState = final;

        const awaiting = final?.scratch?.awaiting as any;
        if (
          ((awaiting?.type === 'input') as boolean) &&
          Array.isArray(awaiting?.questions) &&
          awaiting.questions.length > 0
        ) {
          const questions = awaiting.questions ?? (final.output?.diff as any)?.questions ?? [];
          const askedAt = awaiting?.askedAt || new Date().toISOString();

          // Persist awaiting to output (both UI-friendly and runtime-friendly)
          await this.runs.persistResult(run.id, {
            output: {
              ...(final.output ?? {}),
              diff: {
                ...(final.output?.diff ?? {}),
                questions,
                summary:
                  final.output?.diff?.summary ??
                  `Missing information needed: ${questions.map((q: any) => q.key).join(', ')}`,
              },
              awaiting: { type: 'input', questions },
              scratch: {
                ...((final.output as any)?.scratch ?? {}),
                awaiting: { type: 'input', questions, askedAt },
              },
              audit: {
                ...(final.output as any)?.audit,
                qna: [
                  ...(((final.output as any)?.audit ?? {}).qna ?? []),
                  { ts: askedAt, runId: run.id, phase: 'asked', questions } as any,
                ],
              },
            } as any,
            logs: formatLogsForPersistence(),
          });

          await this.runs.updateStatus(run.id, 'awaiting_input');

          await this.eventBus.publish(
            run.id,
            { type: 'run_status', payload: { status: 'awaiting_input', questions } },
            CHANNEL_WEBSOCKET
          );
          return;
        }

        // Check if approval is required (AUTO mode halted after planning)
        const requiresApproval = (final?.scratch as any)?.requiresApproval === true;
        const plan = (final?.scratch?.plan ?? []) as Array<{ id: string; tool: string }>;
        const hasExecutableSteps = plan.length > 0 && 
          !plan.every((st) => st.tool === 'chat.respond');

        if (requiresApproval && hasExecutableSteps) {
          // Persist plan and diff for UI display
          await this.runs.persistResult(run.id, {
            output: final.output,
            logs: formatLogsForPersistence(),
          });

          // Set status to awaiting_approval
          await this.runs.updateStatus(run.id, 'awaiting_approval');

          // Notify UI of awaiting_approval status
          // Note: plan_generated event was already emitted by graph during execution
          await this.eventBus.publish(
            run.id,
            { 
              type: 'run_status', 
              payload: { 
                status: 'awaiting_approval',
                plan: plan.map(s => ({ id: s.id, tool: s.tool }))
              } 
            },
            CHANNEL_WEBSOCKET
          );

          this.logger.log('⏸️ Run awaiting approval', {
            runId: run.id,
            stepsCount: plan.length,
          });

          return;
        }

        // Check if PREVIEW mode (just showing plan, not executing)
        if ((run.mode === 'preview' || run.mode === 'plan') && hasExecutableSteps) {
          // Persist plan and diff for UI display
          await this.runs.persistResult(run.id, {
            output: final.output,
            logs: formatLogsForPersistence(),
          });

          // Set status to done (plan shown, no execution)
          await this.runs.updateStatus(run.id, 'done');

          // Notify UI that preview mode is completed
          // Note: plan_generated event was already emitted by graph during execution
          await this.eventBus.publish(
            run.id,
            { 
              type: 'run_completed', 
              payload: { 
                status: 'done',
                output: final.output ?? {},
                plan: plan.map(s => ({ id: s.id, tool: s.tool }))
              } 
            },
            CHANNEL_WEBSOCKET
          );

          this.logger.log('✅ Preview mode completed (plan shown)', {
            runId: run.id,
            stepsCount: plan.length,
            mode: run.mode,
          });

          await this.telemetry.track('run_completed', { runId: run.id, status: 'done', mode: run.mode });

          return;
        }

        // Normal finalize
        await this.runs.persistResult(run.id, {
          output: final.output,
          logs: formatLogsForPersistence(),
        });
        await this.runs.updateStatus(run.id, 'done');

        // Emit run_completed with lastAssistant for UI
        const commits = Array.isArray(final?.output?.commits) ? final.output.commits : [];
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
    });
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
      (meta as any).approvedSteps = config.approvedSteps;
    }
    if (!(meta as any).channelTargets && (config as any).channelTargets) {
      (meta as any).channelTargets = (config as any).channelTargets;
    }
    if (!(meta as any).policy) {
      (meta as any).policy = job.data.policy ?? run.policySnapshot ?? undefined;
    }
    if (job.data.token) {
      (meta as any).runToken = job.data.token;
    }

    const tz =
      (typeof (meta as any).tz === 'string' && (meta as any).tz.trim().length > 0
        ? ((meta as any).tz as string)
        : typeof (meta as any).timezone === 'string' && (meta as any).timezone.trim().length > 0
          ? ((meta as any).timezone as string)
          : 'Europe/Berlin') ?? 'Europe/Berlin';
    (meta as any).tz = tz;
    (meta as any).jobId = job.id;

    const ctx: RunState['ctx'] & { meta: Record<string, unknown> } = {
      runId: run.id,
      userId: String(run.userId),
      teamId: run.teamId ? String(run.teamId) : undefined,
      scopes: Array.from(scopes),
      traceId:
        typeof (meta as any).traceId === 'string' && (meta as any).traceId.trim().length > 0
          ? ((meta as any).traceId as string)
          : `run:${run.id}`,
      tz,
      now: new Date(),
      meta,
    };

    const rawOut = (run?.output ?? {}) as Record<string, any>;
    const persistedScratch =
      rawOut.scratch && typeof rawOut.scratch === 'object'
        ? (rawOut.scratch as Record<string, unknown>)
        : {};
    const { scratch: _drop, ...restOutput } = rawOut;

    const initialState: RunState = {
      input,
      mode: this.mapRunMode(job.data.mode ?? run.mode),
      ctx,
      scratch: {
        ...(persistedScratch as any),
        ...structuredClone((job.data as any)?.scratch ?? {}),
      },
      output: restOutput as RunState['output'],
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
