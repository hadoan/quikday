import {
  Injectable,
  NotFoundException,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { CreateRunDto } from './runs.controller.js';
import { RunCreationService } from './run-creation.service.js';
import { RunQueryService } from './run-query.service.js';
import { RunStatus } from '@prisma/client';
import type { Goal, PlanStep, MissingField } from './types.js';
import {
  buildPolicySnapshot,
  initialStatusForMode,
  normalizeMessages,
  resolvePrompt,
  type MessageLike,
} from './utils/run-helpers.js';
import { RunWorkflowService } from './run-workflow.service.js';

@Injectable()
export class RunsService {
  private isNoLog = true;
  // private readonly logger =
  //   this.isNoLog === true
  //     ? ({
  //         log: (_: any, __?: any) => {},
  //         debug: (_: any, __?: any) => { /* no-op */ },
  //         warn: (_: any, __?: any) => {},
  //         error: (_: any, __?: any) => {},
  //       } as unknown as Logger)
  //     : new Logger(RunsService.name);
  private readonly logger = new Logger(RunsService.name);

  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService,
    private readonly creationService: RunCreationService,
    private readonly queryService: RunQueryService,
    private readonly workflow: RunWorkflowService
  ) {}

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

    const sub = claims?.sub || claims?.userId || undefined;
    if (!sub) {
      this.logger.warn('Missing sub in auth claims; cannot resolve user', { claims });
      throw new UnauthorizedException('Missing subject (sub) in auth claims');
    }

    this.logger.debug('👤 Looking up user by sub from auth claims', { sub });
    const user = await this.prisma.user.findUnique({ where: { sub } });
    if (!user) {
      this.logger.warn('Authenticated user not found in database', { sub });
      throw new UnauthorizedException('Authenticated user not found');
    }

    this.logger.debug('🏢 Validating team', { teamId });
    const team = teamId ? await this.prisma.team.findUnique({ where: { id: teamId } }) : null;

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

    const normalizedMessages = normalizeMessages(messages as MessageLike[] | undefined, promptInput);
    const prompt = resolvePrompt(promptInput, normalizedMessages);
    if (!prompt) {
      this.logger.warn('Run creation missing prompt and user messages', { teamId, mode });
      throw new BadRequestException('Prompt or user message required');
    }

    const policySnapshot = await buildPolicySnapshot(team?.id ?? null, toolAllowlist);

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

    const run = await this.prisma.run.create({
      data: {
        teamId: team?.id ?? undefined,
        userId: user.id,
        prompt,
        mode,
        status: initialStatusForMode(mode),
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

    if (mode === 'auto') {
      this.logger.log('🚀 Auto-enqueueing run (mode=auto)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueue(run.id);
    } else if (mode === 'preview') {
      this.logger.log('�️ Enqueueing run for preview (mode=preview)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueue(run.id);
    } else if (mode === 'approval') {
      this.logger.log('✋ Enqueueing run for approval (mode=approval)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueue(run.id);
    } else if (mode === 'scheduled' && scheduledAt) {
      const delay = new Date(scheduledAt).getTime() - Date.now();
      this.logger.log('⏰ Scheduling run for delayed execution', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        scheduledAt,
        delayMs: delay,
      });
      await this.enqueue(run.id, { delayMs: Math.max(0, delay) });
    }

    this.logger.log('✅ Run creation completed', {
      timestamp: new Date().toISOString(),
      runId: run.id,
    });

    return run;
  }

  // Delegate to creation service
  async createFromPromptDelegated(dto: CreateRunDto, claims: any = {}) {
    return this.creationService.createFromPrompt(dto, claims);
  }

  // ----------------------------------------------------------------------------
  // List Runs (list projection + filters/sort/pagination)
  // ----------------------------------------------------------------------------
  async list(params: {
    userId?: string;
    page?: number;
    pageSize?: number;
    status?: RunStatus[];
    q?: string;
    sortBy?: 'createdAt' | 'lastEventAt' | 'status' | 'stepCount';
    sortDir?: 'asc' | 'desc';
  }) {
    return this.queryService.list(params);
  }

  // ----------------------------------------------------------------------------
  // Cancel Run (pre-execution)
  // ----------------------------------------------------------------------------
  async cancel(runId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');
    const allowed = new Set<RunStatus>([
      RunStatus.PLANNING,
      RunStatus.QUEUED,
      RunStatus.SCHEDULED,
      RunStatus.AWAITING_APPROVAL,
      RunStatus.APPROVED,
    ]);
    if (!allowed.has(run.status)) {
      throw new BadRequestException('Run not cancelable in current status');
    }
    await this.prisma.run.update({ where: { id: runId }, data: { status: RunStatus.CANCELED } });
  }

  async enqueue(
    runId: string,
    opts: { delayMs?: number; scratch?: Record<string, unknown> } = {}
  ) {
    return this.workflow.enqueue(runId, opts);
  }

  async persistPlan(runId: string, plan: Array<{ tool: string; args?: any }>, diff: any) {
    return this.workflow.persistPlan(runId, plan, diff);
  }

  async get(id: string, userSub?: string) {
    return this.queryService.get(id, userSub);
  }

  async updateStatus(id: string, status: RunStatus) {
    return this.prisma.run.update({ where: { id }, data: { status } });
  }

  async approveSteps(runId: string, approvedSteps: string[]) {
    return this.workflow.approveSteps(runId, approvedSteps);
  }

  async undoRun(runId: string) {
    return this.workflow.undoRun(runId);
  }

  async persistResult(id: string, result: { logs?: any[]; output?: any; error?: any }) {
    return this.workflow.persistResult(id, result);
  }

  async refreshRunCredentials(runId: string): Promise<{ updated: number }> {
    return this.workflow.refreshRunCredentials(runId);
  }

  /**
   * Update credentialId in chat items of type 'app_credentials' for a given run.
   * Now uses the same step re-resolution logic so that chat hydration reflects the latest data.
   */
  async updateChatItemCredentials(runId: string): Promise<{ updated: number }> {
    return this.workflow.updateChatItemCredentials(runId);
  }

  /**
   * Persist user-provided answers into run.output.scratch and clear any pause flag.
   */
  async applyUserAnswers(runId: string, answers: Record<string, unknown>) {
    return this.workflow.applyUserAnswers(runId, answers);
  }


  async persistValidationErrors(
    runId: string,
    answers: Record<string, unknown>,
    errors: Record<string, string>
  ) {
    return this.workflow.persistValidationErrors(runId, answers, errors);
  }

  /**
   * Create a run with plan data (for /agent/plan endpoint).
   * This creates a run in 'planning' or 'awaiting_input' status with intent and steps.
   * @param data - Run creation data including prompt, userId, teamId, tz, goal, plan, missing
   * @returns Created run with id
   */
  async createPlanRun(data: {
    prompt: string;
    userId: number;
    teamId?: number;
    tz: string;
    goal: Goal | null;
    plan: PlanStep[];
    missing: MissingField[];
    no_ws_socket_notify?: boolean;
  }) {
    return this.creationService.createPlanRun(data);
  }

  /**
   * Store user-provided answers to missing input fields in the answers column
   */
  async storeAnswers(runId: string, answers: Record<string, unknown>) {
    return this.workflow.storeAnswers(runId, answers);
  }

  /**
   * Execute the plan with provided answers by reconstructing state and running from executor node
   */
  async executePlanWithAnswers(runId: string) {
    return this.workflow.executePlanWithAnswers(runId);
  }

  async getChatItem(runId: string, chatItemId: string, userSub: string) {
    return this.workflow.getChatItem(runId, chatItemId, userSub);
  }

  async hideQuestionChatItems(runId: string) {
    return this.workflow.hideQuestionChatItems(runId);
  }
}
