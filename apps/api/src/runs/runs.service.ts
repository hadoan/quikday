import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelemetryService } from '../telemetry/telemetry.service';
import { CreateRunDto } from './runs.controller';

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService,
    @InjectQueue('runs') private runsQueue: Queue
  ) {}

  async createFromPrompt(dto: CreateRunDto) {
    const { prompt, mode, teamId, scheduledAt, channelTargets, toolAllowlist } = dto;

    this.logger.log('🔨 Creating run from prompt', {
      timestamp: new Date().toISOString(),
      mode,
      teamId,
      hasSchedule: !!scheduledAt,
      hasTargets: !!channelTargets,
      hasAllowlist: !!toolAllowlist,
    });

    // TODO: Load or create user based on auth context
    // For now assume a placeholder user with id 1 exists or create a minimal one
    this.logger.debug('👤 Upserting dev user');
    const user = await this.prisma.user.upsert({
      where: { sub: 'dev-user' },
      update: {},
      create: { sub: 'dev-user', email: 'dev@example.com', displayName: 'Dev User' },
    });

    this.logger.debug('🏢 Validating team', { teamId });
    // Ensure team exists
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');

    this.logger.log('💾 Persisting run to database', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      teamId: team.id,
    });

    // Create the run
    const run = await this.prisma.run.create({
      data: {
        teamId: team.id,
        userId: user.id,
        prompt,
        mode,
        status: mode === 'plan' ? 'planned' : 'queued',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        config: {
          channelTargets: channelTargets || [],
        },
        toolAllowlist: toolAllowlist ? { tools: toolAllowlist } : undefined,
      },
    });

    this.logger.log('✅ Run persisted to database', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      status: run.status,
    });

    this.logger.debug('📊 Tracking telemetry event');
    await this.telemetry.track('run_created', { runId: run.id, teamId: team.id, mode });

    // Auto-enqueue if mode is 'auto'
    if (mode === 'auto') {
      this.logger.log('🚀 Auto-enqueueing run (mode=auto)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueue(run.id);
    }

    // Schedule if mode is 'scheduled'
    if (mode === 'scheduled' && scheduledAt) {
      const delay = new Date(scheduledAt).getTime() - Date.now();
      this.logger.log('⏰ Scheduling run for delayed execution', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        scheduledAt,
        delayMs: delay,
      });
      await this.runsQueue.add(
        'execute',
        { runId: run.id },
        { delay: delay > 0 ? delay : 0, removeOnComplete: 100, removeOnFail: 100 }
      );
    }

    this.logger.log('✅ Run creation completed', {
      timestamp: new Date().toISOString(),
      runId: run.id,
    });

    return run;
  }

  async enqueue(runId: string) {
    this.logger.log('📮 Adding job to BullMQ queue', {
      timestamp: new Date().toISOString(),
      runId,
      queue: 'runs',
      jobType: 'execute',
    });

    const job = await this.runsQueue.add(
      'execute',
      { runId },
      { removeOnComplete: 100, removeOnFail: 100 }
    );

    this.logger.log('✅ Job added to queue', {
      timestamp: new Date().toISOString(),
      runId,
      jobId: job.id,
      queue: 'runs',
    });
  }

  async get(id: string) {
    const run = await this.prisma.run.findUnique({
      where: { id },
      include: {
        steps: true,
        effects: true,
      },
    });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.run.update({ where: { id }, data: { status } });
  }

  async approveSteps(runId: string, approvedSteps: string[]) {
    // Update run to mark approved steps
    await this.prisma.run.update({
      where: { id: runId },
      data: {
        config: {
          approvedSteps,
        },
      },
    });

    // Enqueue for execution
    await this.enqueue(runId);

    await this.telemetry.track('run_approved', { runId, stepsCount: approvedSteps.length });
  }

  async undoRun(runId: string) {
    const run = await this.get(runId);

    // Get all effects that can be undone
    const effects = await this.prisma.runEffect.findMany({
      where: {
        runId,
        canUndo: true,
        undoneAt: null,
      },
    });

    if (effects.length === 0) {
      throw new NotFoundException('No undoable effects found for this run');
    }

    // Mark all as undone (actual undo logic will be in processor)
    await this.prisma.runEffect.updateMany({
      where: {
        runId,
        canUndo: true,
        undoneAt: null,
      },
      data: {
        undoneAt: new Date(),
      },
    });

    await this.telemetry.track('run_undone', { runId, effectsCount: effects.length });

    return { ok: true, undoneCount: effects.length };
  }

  async persistResult(id: string, result: { logs?: any[]; output?: any; error?: any }) {
    if (result.logs?.length) {
      for (const entry of result.logs) {
        await this.prisma.step.create({
          data: {
            runId: id,
            tool: entry.tool || 'unknown',
            action: entry.action || '',
            appId: entry.appId || null,
            credentialId: entry.credentialId || null,
            request: entry.request ?? null,
            response: entry.result ?? null,
            errorCode: entry.errorCode || null,
            startedAt: new Date(entry.ts || Date.now()),
          },
        });
      }
    }
    await this.prisma.run.update({
      where: { id },
      data: { output: result.output ?? null, error: result.error ?? null },
    });
  }
}
