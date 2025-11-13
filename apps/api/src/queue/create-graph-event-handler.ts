import { Logger } from '@nestjs/common';
import { ErrorCode } from '@quikday/types';
import type { RunState } from '@quikday/agent/state/types';
import type { RunEvent as GraphRunEvent } from '@quikday/agent/observability/events';
import type { RunEvent as UiRunEvent } from '@quikday/libs/redis/RunEvent';
import type { TelemetryService } from '../telemetry/telemetry.service.js';

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
  // Correlate to plan/executor step id (e.g., step-02-0)
  planStepId?: string;
};

export function createGraphEventHandler(opts: {
  run: any;
  liveStateRef: { get: () => RunState; set: (s: RunState) => void };
  markStep: (
    tool: string,
    status: 'succeeded' | 'failed',
    updater?: (entry: StepLogEntry) => void
  ) => void;
  applyDelta: (target: any, delta: any) => void;
  appendStatusMessage: (type: UiRunEvent['type'], payload: UiRunEvent['payload']) => void;
  stepLogs: StepLogEntry[];
  setGraphEmitted: (v: boolean) => void;
  logger: Logger;
  telemetry: TelemetryService;
  persistPlanSteps?: (plan: any[], diff: any) => Promise<void>;
  enrichPlanWithCredentials?: (plan: any[]) => Promise<any[]>;
  persistStepOutput?: (step: {
    id: string;
    tool: string;
    args: any;
    result: any;
    startedAt: Date;
    endedAt: Date;
  }) => Promise<void>;
}) {
  const {
    run,
    liveStateRef,
    markStep,
    applyDelta,
    appendStatusMessage,
    stepLogs,
    setGraphEmitted,
    logger,
    telemetry,
    persistPlanSteps,
    enrichPlanWithCredentials,
    persistStepOutput,
  } = opts;

  return (evt: GraphRunEvent) => {
    if (evt.runId !== run.id) return;
    try {
      switch (evt.type) {
        // case 'node.enter': {
        //   const node = (evt.payload as any)?.node;
        //   if (node === 'planner') appendStatusMessage('run_status', { status: 'planning' });
        //   if (node === 'executor') appendStatusMessage('run_status', { status: 'executing' });
        //   break;
        // }
        case 'node.exit': {
          const delta = (evt.payload as any)?.delta;
          if (delta) applyDelta(liveStateRef.get(), delta);
          break;
        }
        // case 'run_status': {
        //   logger.log('▶️ LangGraph run started', { runId: run.id });
        //   appendStatusMessage('run_status', { status: 'running' });
        //   break;
        // }
        case 'plan_generated': {
          const plan = Array.isArray((evt.payload as any)?.plan)
            ? ((evt.payload as any).plan as any[])
            : [];
          const diff = (evt.payload as any)?.diff;
          logger.log('📋 Plan ready', { runId: run.id, steps: plan.length });

          // Enrich plan with credential information before publishing
          if (enrichPlanWithCredentials) {
            void enrichPlanWithCredentials(plan)
              .then((enrichedPlan) => {
                appendStatusMessage('plan_generated', {
                  intent: liveStateRef.get().scratch?.intent,
                  plan: enrichedPlan,
                  tools: enrichedPlan.map((step: any) => step.tool),
                  actions: enrichedPlan.map((step: any) => `Execute ${step.tool}`),
                  steps: enrichedPlan,
                  diff,
                });
              })
              .catch((err) => {
                logger.error('❌ Failed to enrich plan with credentials', {
                  runId: run.id,
                  error: err?.message || String(err),
                });
                // Fallback: publish without enrichment
                appendStatusMessage('plan_generated', {
                  intent: liveStateRef.get().scratch?.intent,
                  plan,
                  tools: plan.map((step: any) => step.tool),
                  actions: plan.map((step: any) => `Execute ${step.tool}`),
                  steps: plan,
                  diff,
                });
              });
          } else {
            // No enrichment available, publish as-is
            appendStatusMessage('plan_generated', {
              intent: liveStateRef.get().scratch?.intent,
              plan,
              tools: plan.map((step: any) => step.tool),
              actions: plan.map((step: any) => `Execute ${step.tool}`),
              steps: plan,
              diff,
            });
          }

          if (persistPlanSteps) {
            void persistPlanSteps(plan, diff).catch((err) =>
              logger.error('? Failed to persist planned steps', {
                runId: run.id,
                error: err?.message || String(err),
              })
            );
          }
          break;
        }
        case 'tool.called': {
          const name = (evt.payload as any)?.name ?? 'unknown';
          const args = (evt.payload as any)?.args;
          const planStepId = (evt.payload as any)?.stepId as string | undefined;
          const startedAt = new Date().toISOString();
          logger.log('🔧 Tool started', { runId: run.id, tool: name });
          stepLogs.push({
            tool: name,
            action: `Executing ${name}`,
            request: args,
            status: 'started',
            startedAt,
            planStepId,
          });
          // appendStatusMessage('step_started', {
          //   tool: name,
          //   action: `Executing ${name}`,
          //   request: args,
          // });
          break;
        }
        case 'tool.succeeded': {
          const name = (evt.payload as any)?.name ?? 'unknown';
          const result = (evt.payload as any)?.result;
          const ms = (evt.payload as any)?.ms;
          logger.log('✅ Tool succeeded', { runId: run.id, tool: name, durationMs: ms });
          markStep(name, 'succeeded', (entry) => {
            entry.result = result;
            entry.ms = typeof ms === 'number' ? ms : undefined;
            entry.action = `Completed ${name}`;
          });
          appendStatusMessage('step_succeeded', {
            tool: name,
            action: `Completed ${name}`,
            response: result,
            ms,
          });
          void telemetry
            .track('step_succeeded', { runId: run.id, tool: name })
            .catch(() => undefined);
          break;
        }
        case 'tool.failed': {
          const name = (evt.payload as any)?.name ?? 'unknown';
          const error = (evt.payload as any)?.error;
          logger.error('❌ Tool failed', { runId: run.id, tool: name, error });
          markStep(name, 'failed', (entry) => {
            entry.errorCode = (error?.code as string) ?? ErrorCode.E_STEP_FAILED;
            entry.errorMessage = error?.message as string | undefined;
            entry.action = `Failed ${name}`;
          });
          appendStatusMessage('step_failed', { tool: name, error });
          void telemetry
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
          const steps = Array.isArray((evt.payload as any)?.steps)
            ? ((evt.payload as any).steps as any[])
            : [];

          // Log high-risk steps requiring approval
          const highRiskSteps = steps.filter((step) => step.risk === 'high');
          logger.log('⏸️ Awaiting approval for high-risk steps', {
            runId: run.id,
            approvalId,
            stepCount: steps.length,
            highRiskCount: highRiskSteps.length,
            tools: steps.map((s) => s.tool).join(', '),
          });

          // Include pending steps so the UI can render an approval CTA with step ids
          appendStatusMessage('run_status', { status: 'awaiting_approval', approvalId, steps });
          break;
        }
        case 'fallback': {
          const reason = (evt.payload as any)?.reason ?? 'unspecified';
          const details = (evt.payload as any)?.details;
          logger.warn('⚠️ Run fell back', { runId: run.id, reason, details });
          appendStatusMessage('run_status', { status: 'fallback', reason, details });
          break;
        }
        case 'run_completed': {
          setGraphEmitted(true);
          const output = evt.payload ?? liveStateRef.get().output ?? {};
          logger.log('🎉 LangGraph run completed event', { runId: run.id });
          appendStatusMessage('run_completed', { status: 'done', output });
          break;
        }
        case 'step_failed': {
          const error = evt.payload;
          logger.error('🔴 LangGraph run failed event', { runId: run.id, error });
          appendStatusMessage('run_status', { status: 'failed', error });
          break;
        }
        case 'awaiting.input': {
          const questions = (evt.payload as any)?.questions ?? [];
          logger.log('⏸️ Awaiting user input', { runId: run.id, questions });
          appendStatusMessage('run_status', { status: 'awaiting_input', questions });
          break;
        }
        case 'step.executed': {
          const step = evt.payload as {
            id: string;
            tool: string;
            args: any;
            result: any;
            startedAt: Date;
            endedAt: Date;
          };
          if (persistStepOutput) {
            void persistStepOutput(step).catch((err) =>
              logger.error('❌ Failed to persist step output', {
                runId: run.id,
                stepId: step.id,
                tool: step.tool,
                error: err?.message || String(err),
              })
            );
          }
          break;
        }
        default:
          break;
      }
    } catch (handlerErr) {
      logger.error('❌ Failed to handle LangGraph event', {
        runId: run.id,
        eventType: evt.type,
        error: handlerErr instanceof Error ? handlerErr.message : handlerErr,
      });
    }
  };
}
