// apps/api/src/queue/step-run.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { runWithCurrentUser } from '@quikday/libs';
import type { CurrentUserContext } from '@quikday/types/auth/current-user.types';
import { registry } from '@quikday/agent/registry/registry';

type StepRunJobData = {
  runId: string;
  planStepId: string;
  tool: string;
  args: any;
  __ctx: CurrentUserContext;
};

@Processor('steps')
export class StepRunProcessor extends WorkerHost {
  private readonly logger = new Logger(StepRunProcessor.name);

  async process(job: Job<StepRunJobData>) {
    const { runId, planStepId, tool, args, __ctx } = job.data || ({} as StepRunJobData);
    if (!runId || !planStepId || !tool) {
      this.logger.error('❌ Invalid step run job payload', {
        jobId: job.id,
        runId,
        planStepId,
        tool,
      });
      throw new Error('Invalid step run job payload');
    }

    this.logger.log('🔧 Processing step', { jobId: job.id, runId, planStepId, tool });

    const t0 = globalThis.performance?.now?.() ?? Date.now();
    try {
      const result = await runWithCurrentUser(__ctx, async () => {
        return registry.call(tool, args, {
          runId: runId,
          userId: String((__ctx as any).userSub ?? ''),
          teamId: __ctx.teamId ?? undefined,
          scopes: __ctx.scopes ?? [],
          traceId: __ctx.traceId ?? `run:${runId}`,
          tz: (__ctx as any).tz ?? 'Europe/Berlin',
          now: new Date(),
          meta: {},
        } as any);
      });

      const ms = (globalThis.performance?.now?.() ?? Date.now()) - t0;
      this.logger.log('✅ Step succeeded', { runId, planStepId, tool, ms });
      return { result, ms };
    } catch (err: any) {
      this.logger.error('❌ Step failed', {
        runId,
        planStepId,
        tool,
        error: err?.message ?? String(err),
      });
      throw err;
    }
  }
}
