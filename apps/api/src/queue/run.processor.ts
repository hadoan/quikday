import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { RunsService } from '../runs/runs.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ErrorCode } from '@quikday/types';
import { RedisPubSubService } from '@quikday/libs';
import { buildMainGraph } from '@quikday/agent/buildMainGraph';
import { makeOpenAiLLM } from '@quikday/agent/llm/openai';
import type { RunState } from '@quikday/agent/state/types';
import { bus, type RunEvent as GraphRunEvent } from '@quikday/agent/observability/events';
import type { RunEvent as UiRunEvent } from '../redis/redis-pubsub.service';

const GRAPH_HALT_AWAITING_APPROVAL = 'GRAPH_HALT_AWAITING_APPROVAL';

@Processor('runs')
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(
    private runs: RunsService,
    private telemetry: TelemetryService,
    private redisPubSub: RedisPubSubService
  ) {
    super();
  }

  async process(job: Job<{ runId: string }>) {
    this.logger.log('🎬 Job picked up from queue', {
      timestamp: new Date().toISOString(),
      jobId: job.id,
      runId: job.data.runId,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
    });

    this.logger.log('📖 Fetching run details from database', {
      timestamp: new Date().toISOString(),
      runId: job.data.runId,
    });

    const run = await this.runs.get(job.data.runId);

    this.logger.log('🔄 Updating run status to "running"', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      previousStatus: run.status,
    });

    await this.runs.updateStatus(run.id, 'running');

    // Publish status update to Redis
    await this.redisPubSub.publishRunEvent(run.id, {
      type: 'run_status',
      payload: { status: 'running' },
    });

    this.logger.log('▶️ Starting run execution', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      prompt: run.prompt.substring(0, 50) + (run.prompt.length > 50 ? '...' : ''),
      mode: run.mode,
      userId: run.userId,
      teamId: run.teamId,
    });

    try {
      this.logger.log('🧠 Initialising LangGraph run state', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });

      const llm = makeOpenAiLLM();
      const graph = buildMainGraph({ llm });

      const meta: Record<string, unknown> =
        run.config && typeof run.config === 'object' ? { ...(run.config as Record<string, unknown>) } : {};

      const scopes = new Set<string>();
      const runAny = run as any;
      if (Array.isArray(runAny?.scopes)) {
        for (const scope of runAny.scopes) {
          if (typeof scope === 'string') scopes.add(scope);
        }
      }
      if (Array.isArray(runAny?.RunScopedKeys)) {
        for (const scopedKey of runAny.RunScopedKeys) {
          if (scopedKey?.scope) scopes.add(String(scopedKey.scope));
        }
      }

      const ctx: RunState['ctx'] & { meta: Record<string, unknown> } = {
        runId: run.id,
        userId: String(run.userId),
        teamId: run.teamId ? String(run.teamId) : undefined,
        scopes: Array.from(scopes),
        traceId: `run:${run.id}`,
        tz: (meta.timezone as string | undefined) ?? 'Europe/Berlin',
        now: new Date(),
        meta,
      };

      const initialState: RunState = {
        input: { prompt: run.prompt },
        mode: run.mode?.toUpperCase() === 'AUTO' ? 'AUTO' : 'PLAN',
        ctx,
        scratch: {},
        output: {},
      };

      const publishRunEvent = (type: UiRunEvent['type'], payload: UiRunEvent['payload']) =>
        this.redisPubSub.publishRunEvent(run.id, { type, payload });

      const safePublish = (type: UiRunEvent['type'], payload: UiRunEvent['payload']) =>
        void publishRunEvent(type, payload).catch((publishErr) =>
          this.logger.error('❌ Failed to publish run event', {
            runId: run.id,
            type,
            error: publishErr?.message ?? publishErr,
          })
        );

      const applyDelta = (target: any, delta: any) => {
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
            applyDelta(target[key], value);
            continue;
          }
          target[key] = value;
        }
      };

      let liveState: RunState = structuredClone(initialState);
      let graphEmittedRunCompleted = false;

      const handleGraphEvent = (evt: GraphRunEvent) => {
        if (evt.runId !== run.id) {
          return;
        }

        try {
          if (evt.type === 'node.exit') {
            const delta = (evt.payload as any)?.delta;
            if (delta) {
              applyDelta(liveState, delta);
            }
            return;
          }

          switch (evt.type) {
            case 'run.started': {
              this.logger.log('▶️ LangGraph run started', { runId: run.id });
              safePublish('run_status', { status: 'running' });
              break;
            }
            case 'plan.ready': {
              const plan = Array.isArray((evt.payload as any)?.plan)
                ? ((evt.payload as any).plan as any[])
                : [];
              const diff = (evt.payload as any)?.diff;
              this.logger.log('📋 Plan ready', {
                runId: run.id,
                steps: plan.length,
              });
              safePublish('plan_generated', {
                intent: liveState.scratch?.intent,
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
              this.logger.log('🔧 Tool started', { runId: run.id, tool: name });
              safePublish('step_started', {
                tool: name,
                action: `Executing ${name}`,
                request: args,
              });
              break;
            }
            case 'tool.succeeded': {
              const name = (evt.payload as any)?.name ?? 'unknown';
              const result = (evt.payload as any)?.result;
              const ms = (evt.payload as any)?.ms;
              this.logger.log('✅ Tool succeeded', {
                runId: run.id,
                tool: name,
                durationMs: ms,
              });
              safePublish('step_succeeded', {
                tool: name,
                action: `Completed ${name}`,
                response: result,
                ms,
              });
              void this.telemetry
                .track('step_succeeded', { runId: run.id, tool: name })
                .catch(() => undefined);
              break;
            }
            case 'tool.failed': {
              const name = (evt.payload as any)?.name ?? 'unknown';
              const error = (evt.payload as any)?.error;
              this.logger.error('❌ Tool failed', { runId: run.id, tool: name, error });
              safePublish('step_failed', { tool: name, error });
              void this.telemetry
                .track('step_failed', {
                  runId: run.id,
                  tool: name,
                  errorCode: (error?.code as string) ?? ErrorCode.E_STEP_FAILED,
                })
                .catch(() => undefined);
              break;
            }
            case 'approval.awaiting': {
              const approvalId = (evt.payload as any)?.approvalId;
              this.logger.log('⏸️ Awaiting approval', {
                runId: run.id,
                approvalId,
              });
              safePublish('run_status', {
                status: 'awaiting_approval',
                approvalId,
              });
              break;
            }
            case 'run.completed': {
              graphEmittedRunCompleted = true;
              const output = evt.payload ?? liveState.output ?? {};
              this.logger.log('🎉 LangGraph run completed event', { runId: run.id });
              safePublish('run_completed', {
                status: 'done',
                output,
              });
              break;
            }
            case 'run.failed': {
              const error = evt.payload;
              this.logger.error('🔴 LangGraph run failed event', { runId: run.id, error });
              safePublish('run_status', {
                status: 'failed',
                error,
              });
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

      bus.on('*', handleGraphEvent);

      let final: RunState;
      try {
        final = await graph.run('classify', initialState);
      } finally {
        bus.off('*', handleGraphEvent);
      }

      liveState = final;

      this.logger.log('💾 Persisting LangGraph result', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        hasOutput: !!final.output,
      });

      await this.runs.persistResult(run.id, { output: final.output });

      this.logger.log('🎉 Updating run status to "done"', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });

      await this.runs.updateStatus(run.id, 'done');

      if (!graphEmittedRunCompleted) {
        await publishRunEvent('run_completed', {
          status: 'done',
          output: final.output ?? {},
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

        await this.runs.updateStatus(run.id, 'awaiting_approval');

        if (approvalId) {
          this.logger.log('⏸️ Run awaiting approval with ID', {
            runId: run.id,
            approvalId,
          });
        } else {
          this.logger.log('⏸️ Run awaiting approval', {
            runId: run.id,
          });
        }

        await this.redisPubSub.publishRunEvent(run.id, {
          type: 'run_status',
          payload: approvalId
            ? { status: 'awaiting_approval', approvalId }
            : { status: 'awaiting_approval' },
        });

        return;
      }

      this.logger.error('❌ Job execution failed', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        runId: run.id,
        error: err?.message,
        errorCode: err?.code,
      });

      const errorPayload = {
        message: err?.message ?? 'run failed',
        code: err?.code ?? ErrorCode.E_PLAN_FAILED,
      };

      this.logger.log('💾 Persisting error result', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        errorCode: errorPayload.code,
      });

      await this.runs.persistResult(run.id, { error: errorPayload });
      await this.runs.updateStatus(run.id, 'failed');

      // Publish failure event to Redis
      await this.redisPubSub.publishRunEvent(run.id, {
        type: 'run_status',
        payload: { status: 'failed', error: errorPayload },
      });

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
}
