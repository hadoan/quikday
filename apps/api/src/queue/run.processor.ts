import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RunsService } from '../runs/runs.service';
import { buildSocialGraph } from '../engine/social.graph';
import { TelemetryService } from '../telemetry/telemetry.service';

@Processor('runs')
export class RunProcessor extends WorkerHost {
  constructor(
    private runs: RunsService,
    private telemetry: TelemetryService
  ) {
    super();
  }

  async process(job: Job<{ runId: string }>) {
    const run = await this.runs.get(job.data.runId);
    await this.runs.updateStatus(run.id, 'running');

    try {
      const graph = buildSocialGraph();
      const state = await graph.invoke({ prompt: run.prompt, logs: [] });
      await this.runs.persistResult(run.id, { logs: state.logs, output: state.output });
      await this.runs.updateStatus(run.id, 'done');
      await this.telemetry.track('run_done', { runId: run.id });
    } catch (err: any) {
      await this.runs.persistResult(run.id, { error: { message: err?.message } });
      await this.runs.updateStatus(run.id, 'failed');
      await this.telemetry.track('run_failed', {
        runId: run.id,
        message: String(err?.message || err),
      });
      throw err;
    }
  }
}
