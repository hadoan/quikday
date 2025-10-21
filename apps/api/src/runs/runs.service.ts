import { Injectable, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
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

  async createFromPrompt(dto: CreateRunDto, claims: any = {}) {
    const { prompt, mode, teamId, scheduledAt, channelTargets, toolAllowlist } = dto;

    this.logger.log('🔨 Creating run from prompt', {
      timestamp: new Date().toISOString(),
      mode,
      teamId,
      hasSchedule: !!scheduledAt,
      hasTargets: !!channelTargets,
      hasAllowlist: !!toolAllowlist,
    });

    // Load or create user based on auth claims populated by KindeGuard
    // Expected claims shape: { sub, email, name } (Kinde) or similar JWT claims
    const sub = claims?.sub || claims?.userId || undefined;
    if (!sub) {
      this.logger.warn('Missing sub in auth claims; cannot resolve user', { claims });
      throw new UnauthorizedException('Missing subject (sub) in auth claims');
    }
    const email = claims?.email || claims?.email_address || null;
    const displayName = claims?.name || claims?.displayName || 'Dev User';

    this.logger.debug('👤 Looking up user by sub from auth claims', { sub });
    const user = await this.prisma.user.findUnique({ where: { sub } });
    if (!user) {
      this.logger.warn('Authenticated user not found in database', { sub });
      throw new UnauthorizedException('Authenticated user not found');
    }

    // Ensure the user is a member of the target team. If the team exists and the user is not a member, add them.
    this.logger.debug('🏢 Validating team', { teamId });
    const team = teamId ? await this.prisma.team.findUnique({ where: { id: teamId } }) : null;

    // If team not found it's acceptable (team can be null). Do not check membership when team is null.
    if (team) {
      const membership = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: team.id, userId: user.id } },
      });
      if (!membership) {
        this.logger.debug('➕ Adding user to team as member', { userId: user.id, teamId: team.id });
        await this.prisma.teamMember.create({
          data: { teamId: team.id, userId: user.id, role: 'member' },
        });
      }
    } else {
      this.logger.debug('No team provided or team not found; proceeding with teamless run');
    }

    this.logger.log('💾 Persisting run to database', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      teamId: team?.id ?? null,
    });

    // Create the run
    const run = await this.prisma.run.create({
      data: {
        // teamId may be undefined for teamless runs.
        teamId: team?.id ?? undefined,
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
    await this.telemetry.track('run_created', { runId: run.id, teamId: team?.id ?? null, mode });

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
