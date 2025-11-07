import { Queue, QueueEvents, JobsOptions } from 'bullmq';

export function createQueueHelpers(s: any) {
  let stepQueue: Queue | null = null;
  let stepQueueEvents: QueueEvents | null = null;

  const getStepQueue = () => {
    if (!stepQueue) {
      const url = process.env.REDIS_URL || process.env.REDIS_URL_HTTP || process.env.REDIS_URL_WS;
      if (!url) {
        throw Object.assign(new Error('Step queue unavailable: set REDIS_URL to enable queued execution'), { code: 'E_QUEUE_UNAVAILABLE' });
      }
      stepQueue = new Queue('steps', { connection: { url } as any });
      stepQueueEvents = new QueueEvents('steps', { connection: { url } as any });
    }
    return stepQueue;
  };

  async function runStepViaQueue(planStepId: string, toolName: string, args: any) {
    const q = getStepQueue();
    if (!stepQueueEvents) {
      throw Object.assign(new Error('Step queue events unavailable'), { code: 'E_QUEUE_UNAVAILABLE' });
    }

    const jobId = `run-${s.ctx.runId}-step-${planStepId}-${Date.now().toString(36)}`;
    const jobOpts: JobsOptions = {
      jobId,
      attempts: 2,
      removeOnComplete: 100,
      removeOnFail: 100,
      backoff: { type: 'exponential', delay: 1000 },
    };
    const __ctx = {
      userSub: s.ctx.userId ? String(s.ctx.userId) : null,
      teamId: s.ctx.teamId ? Number(s.ctx.teamId) : null,
      scopes: s.ctx.scopes,
      traceId: s.ctx.traceId,
      tz: s.ctx.tz,
      runId: s.ctx.runId,
    } as any;

    const job = await q.add('execute-step', {
      runId: s.ctx.runId,
      planStepId,
      tool: toolName,
      args,
      __ctx,
    }, jobOpts);

    const res = await job.waitUntilFinished(stepQueueEvents, 60_000);
    return (res as any)?.result ?? null;
  }

  return { runStepViaQueue };
}
