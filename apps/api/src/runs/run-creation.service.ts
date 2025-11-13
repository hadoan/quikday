import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { StepsService } from './steps.service.js';
import { ChatItemOrchestratorService } from './chat-item-orchestrator.service.js';
import { RunAuthorizationService } from './run-authorization.service.js';
import { RunStatus } from '@prisma/client';
import type { CreateRunDto } from './runs.controller.js';
import type { Goal, PlanStep, MissingField } from './types.js';

/**
 * RunCreationService handles creating new runs.
 * Follows Single Responsibility Principle by focusing only on run creation.
 */
@Injectable()
export class RunCreationService {
  private readonly logger = new Logger(RunCreationService.name);

  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService,
    private stepsService: StepsService,
    private chatItemOrchestrator: ChatItemOrchestratorService,
    private authService: RunAuthorizationService,
    @InjectQueue('runs') private runsQueue: Queue
  ) {}

  /**
   * Create a run from a prompt (main entry point for run creation)
   */
  async createFromPrompt(dto: CreateRunDto, claims: any = {}) {
    const {
      mode,
      teamId,
      scheduledAt,
      channelTargets,
      toolAllowlist,
      messages,
      prompt: promptInput,
      meta,
    } = dto;

    this.logger.log('🔨 Creating run request', {
      timestamp: new Date().toISOString(),
      mode,
      teamId,
      hasSchedule: !!scheduledAt,
      hasTargets: !!channelTargets?.length,
      hasAllowlist: !!toolAllowlist?.length,
      messageCount: messages?.length ?? 0,
    });

    // Resolve user from claims
    const user = await this.authService.resolveUserFromClaims(claims);

    // Validate team access
    const team = await this.authService.validateTeamAccess(teamId, user.id);

    // Normalize messages and resolve prompt
    const normalizedMessages = this.authService.normalizeMessages(messages, promptInput);
    const prompt = this.authService.resolvePrompt(promptInput, normalizedMessages);
    if (!prompt) {
      this.logger.warn('Run creation missing prompt and user messages', { teamId, mode });
      throw new BadRequestException('Prompt or user message required');
    }

    // Build policy snapshot
    const policySnapshot = await this.authService.buildPolicySnapshot(
      team?.id ?? null,
      toolAllowlist
    );

    // Humanize user name
    const humanize = (local: string) =>
      local
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .slice(0, 4)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

    const userName =
      (user.displayName as string | null) ||
      (user.email ? humanize(String(user.email).split('@')[0] ?? '') : '') ||
      undefined;

    // Build config payload
    const configPayload: Record<string, unknown> = {
      channelTargets: channelTargets ?? [],
      input: {
        prompt,
        messages: normalizedMessages.length ? normalizedMessages : undefined,
      },
      approvedSteps: [],
    };

    // Always attach user meta so prompts can include user info
    configPayload.meta = {
      ...(meta && Object.keys(meta).length > 0 ? meta : {}),
      ...(userName ? { userName } : {}),
      ...(user.email ? { userEmail: user.email } : {}),
    };

    this.logger.log('💾 Persisting run to database', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      teamId: team?.id ?? null,
    });

    // Create the run
    const run = await this.prisma.run.create({
      data: {
        teamId: team?.id ?? undefined,
        userId: user.id,
        prompt,
        mode,
        status: this.authService.initialStatusForMode(mode),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        config: configPayload as any,
        toolAllowlist: toolAllowlist ? { tools: toolAllowlist } : undefined,
        policySnapshot,
      },
    });

    this.logger.log('✅ Run persisted to database', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      status: run.status,
    });

    await this.telemetry.track('run_created', { runId: run.id, teamId: team?.id ?? null, mode });

    // Initialize Chat for this run and persist initial user messages
    try {
      const title = prompt.slice(0, 120);
      const chat = await this.prisma.chat.create({
        data: {
          runId: run.id,
          userId: user.id,
          teamId: team?.id ?? null,
          title,
        },
      });

      if (normalizedMessages.length > 0) {
        const items = normalizedMessages.map((m) => ({
          chatId: chat.id,
          type: m.role === 'user' ? 'user_message' : 'assistant',
          role: m.role,
          content: { text: m.content } as any,
          runId: run.id,
          userId: user.id,
          teamId: team?.id ?? null,
        }));
        await this.prisma.chatItem.createMany({ data: items });
      }
    } catch (e) {
      this.logger.warn('Failed to initialize chat for run', e as any);
    }

    // Enqueue based on mode
    if (mode === 'auto') {
      this.logger.log('🚀 Auto-enqueueing run (mode=auto)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueueRun(run.id);
    } else if (mode === 'preview') {
      this.logger.log('👀 Enqueueing run for preview (mode=preview)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueueRun(run.id);
    } else if (mode === 'approval') {
      this.logger.log('✋ Enqueueing run for approval (mode=approval)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueueRun(run.id);
    } else if (mode === 'scheduled' && scheduledAt) {
      const delay = new Date(scheduledAt).getTime() - Date.now();
      this.logger.log('⏰ Scheduling run for delayed execution', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        scheduledAt,
        delayMs: delay,
      });
      await this.enqueueRun(run.id, { delayMs: Math.max(0, delay) });
    }

    this.logger.log('✅ Run creation completed', {
      timestamp: new Date().toISOString(),
      runId: run.id,
    });

    return run;
  }

  /**
   * Create a plan run (used by agent controller after LLM planning)
   */
  async createPlanRun(data: {
    prompt: string;
    userId: number;
    teamId?: number;
    tz: string;
    goal: Goal | null;
    plan: PlanStep[];
    missing: MissingField[];
  }) {
    const { prompt, userId, teamId, tz, goal, plan, missing } = data;

    // Determine status based on whether there are missing inputs
    const status = missing && missing.length > 0 ? RunStatus.AWAITING_INPUT : RunStatus.PLANNING;

    this.logger.log('💾 Creating plan run', {
      userId,
      teamId: teamId ?? null,
      status,
      planSteps: plan?.length || 0,
      missingFields: missing?.length || 0,
    });

    // Create the Run record
    const run = await this.prisma.run.create({
      data: {
        userId,
        teamId: teamId ?? undefined,
        prompt,
        mode: 'preview',
        status,
        // Persist structured planning fields directly on Run
        goal: (goal ?? null) as any,
        plan: (Array.isArray(plan) ? plan : []) as any,
        missing: (Array.isArray(missing) ? missing : []) as any,
        // Preserve tz in config for downstream usage
        config: {
          tz,
        } as any,
      },
    });

    this.logger.log('✅ Plan run created', {
      runId: run.id,
      status: run.status,
    });

    // Create Step records for each step in the plan using StepsService
    if (Array.isArray(plan) && plan.length > 0) {
      await this.stepsService.createSteps(
        plan.map((step: PlanStep, index: number) => ({
          runId: run.id,
          tool: step.tool || 'unknown',
          action: `Execute ${step.tool || 'unknown'}`,
          request: (step as any).request ?? step.args ?? null,
          planStepId: step.id || `step-${index}`,
          startedAt: new Date(),
        })),
        userId
      );

      this.logger.log('✅ Plan steps created', {
        runId: run.id,
        stepCount: plan.length,
      });
    }

    // Create Chat and ChatItems for this run using orchestrator service
    try {
      await this.chatItemOrchestrator.createChatItemsForRun({
        runId: run.id,
        userId,
        teamId: teamId ?? null,
        prompt,
        goal,
        plan,
        missing,
      });
    } catch (e) {
      this.logger.warn('Failed to create chat items for plan run', e as any);
    }

    return run;
  }

  /**
   * Enqueue a run for execution
   */
  private async enqueueRun(
    runId: string,
    opts: { delayMs?: number; scratch?: Record<string, unknown> } = {}
  ) {
    this.logger.log('📮 Adding job to BullMQ queue', {
      timestamp: new Date().toISOString(),
      runId,
      queue: 'runs',
      jobType: 'execute',
      delayMs: opts.delayMs ?? 0,
    });

    await this.runsQueue.add('execute', { runId, ...opts }, { delay: opts.delayMs });

    this.logger.log('✅ Job added to queue', {
      timestamp: new Date().toISOString(),
      runId,
    });
  }
}
