import {
  Injectable,
  NotFoundException,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { CreateRunDto } from './runs.controller.js';
import { RunTokenService } from './run-token.service.js';
import { getTeamPolicy, type TeamPolicy } from '@quikday/agent/guards/policy';
import type { ChatMessage } from '@quikday/agent/state/types';
import { CurrentUserService, getCurrentUserCtx } from '@quikday/libs';
import { StepsService } from './steps.service.js';
import type { Goal, PlanStep, MissingField } from './types.js';

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
    private tokens: RunTokenService,
    @InjectQueue('runs') private runsQueue: Queue,
    private readonly current: CurrentUserService,
    private readonly stepsService: StepsService,
  ) {}

  private jsonClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }

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

    const normalizedMessages = this.normalizeMessages(messages, promptInput);
    const prompt = this.resolvePrompt(promptInput, normalizedMessages);
    if (!prompt) {
      this.logger.warn('Run creation missing prompt and user messages', { teamId, mode });
      throw new BadRequestException('Prompt or user message required');
    }

    const policySnapshot = await this.buildPolicySnapshot(team?.id ?? null, toolAllowlist);

    const configPayload: Record<string, unknown> = {
      channelTargets: channelTargets ?? [],
      input: {
        prompt,
        messages: normalizedMessages.length ? normalizedMessages : undefined,
      },
      approvedSteps: [],
    };

    if (meta && Object.keys(meta).length > 0) {
      configPayload.meta = meta;
    }

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
        status: this.initialStatusForMode(mode),
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

  // ----------------------------------------------------------------------------
  // List Runs (list projection + filters/sort/pagination)
  // ----------------------------------------------------------------------------
  async list(params: {
    page?: number;
    pageSize?: number;
    status?: string[];
    q?: string;
    sortBy?: 'createdAt' | 'lastEventAt' | 'status' | 'stepCount';
    sortDir?: 'asc' | 'desc';
  }) {
    const teamId = this.current.getCurrentTeamId();
    const userSub = this.current.getCurrentUserSub(); // This is the Kinde sub ID (string)
    if (!userSub) throw new UnauthorizedException('Not authenticated');
    
    // Look up the user by their Kinde sub to get the numeric database ID
    const user = await this.prisma.user.findUnique({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException('User not found in database. Please ensure user sync completed.');
    }
    const numericUserId = user.id;

    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 25)));
    const where: any = {};
    if (teamId) where.teamId = Number(teamId);
    if (params.status && params.status.length) where.status = { in: params.status };
    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      where.OR = [
        { id: { contains: q } },
        { prompt: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Sorting
    let orderBy: any = { createdAt: 'desc' };
    const dir = (params.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    switch (params.sortBy) {
      case 'status':
        orderBy = { status: dir };
        break;
      case 'stepCount':
        orderBy = { steps: { _count: dir as any } } as any; // Prisma supports relation count ordering in recent versions
        break;
      case 'lastEventAt':
        // No lastEventAt column; use updatedAt as a proxy
        orderBy = { updatedAt: dir };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: dir };
        break;
    }

    const [total, runs] = await this.prisma.$transaction([
      this.prisma.run.count({ where }),
      this.prisma.run.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          User: true,
          _count: { select: { steps: true } } as any,
        },
      } as any),
    ]);

    const items = runs.map((r: any) => ({
      id: r.id,
      title: (r.intent as any)?.title || r.prompt?.slice(0, 80) || 'Run',
      status: r.status,
      createdAt: r.createdAt,
      createdBy: { id: r.userId, name: r.User?.displayName || r.User?.email || 'User', avatar: r.User?.avatar || null },
      kind: 'action',
      source: ((r.config as any)?.meta?.source as string) || 'api',
      stepCount: r._count?.steps ?? 0,
      approvals: { required: false },
      undo: { available: false },
      lastEventAt: r.updatedAt,
      tags: [],
    }));

    return { items, page, pageSize, total };
  }

  // ----------------------------------------------------------------------------
  // Cancel Run (pre-execution)
  // ----------------------------------------------------------------------------
  async cancel(runId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');
    const allowed = new Set(['planning', 'queued', 'scheduled', 'awaiting_approval', 'approved']);
    if (!allowed.has(run.status)) {
      throw new BadRequestException('Run not cancelable in current status');
    }
    await this.prisma.run.update({ where: { id: runId }, data: { status: 'canceled' } });
  }

  async enqueue(runId: string, opts: { delayMs?: number; scratch?: Record<string, unknown> } = {}) {
    const optsWithScratch = opts as { delayMs?: number; scratch?: Record<string, unknown> };

    this.logger.log('📮 Adding job to BullMQ queue', {
      timestamp: new Date().toISOString(),
      runId,
      queue: 'runs',
      jobType: 'execute',
      delayMs: opts.delayMs ?? 0,
    });

    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    // // Optional: enforce the caller has rights to enqueue this run
    // // (if team-bound run exists but ALS context team differs)
    // const callerTeamId = this.current.getCurrentTeamId();
    // if (run.teamId && callerTeamId && run.teamId !== callerTeamId) {
    //   throw new ForbiddenException('Cross-team enqueue is not allowed');
    // }

    const config = this.asRecord(run.config);
    const input = this.extractInputFromConfig(config, run.prompt);
    const policy = (run.policySnapshot as TeamPolicy | null) ?? null;
    const meta = this.buildMetaForJob(config, policy);
    const scopes = this.deriveScopesFromRun(run, config, policy);

    const tokenTtl = this.tokens.defaultTtlSeconds + Math.ceil((opts.delayMs ?? 0) / 1000);
    const tzCandidate =
      typeof meta.tz === 'string' && meta.tz.trim().length > 0
        ? (meta.tz as string)
        : typeof meta.timezone === 'string' && (meta.timezone as string).trim().length > 0
          ? (meta.timezone as string)
          : 'Europe/Berlin';
    meta.tz = tzCandidate;

    const token = this.tokens.mint({
      runId,
      userId: run.userId,
      teamId: run.teamId ?? null,
      scopes,
      traceId: `run:${run.id}`,
      tz: tzCandidate,
      meta,
      expiresInSeconds: tokenTtl,
    });

    // Require ALS-based context for enqueue (works in HTTP/WS; for background callers, construct ctx explicitly)
    const userSub = this.current.getCurrentUserSub();
    const teamId = this.current.getCurrentTeamId();
    if (!userSub) throw new UnauthorizedException('Not authenticated.');
    // if (!teamId && run.teamId) throw new ForbiddenException('Team context is required.');

    // Clone ALS ctx to ensure serializable payload, and append runId for traceability
    const __ctx = this.jsonClone(getCurrentUserCtx());
    __ctx.runId = runId;

    const jobPayload = {
      runId,
      mode: run.mode,
      input,
      scopes,
      token,
      policy,
      meta,
      ...(optsWithScratch.scratch ? { scratch: optsWithScratch.scratch } : {}),
      __ctx,
    };

    // BullMQ does not allow ':' in custom jobId. Use hyphens instead.
    // IMPORTANT: Previously we used a stable jobId (run+mode) which caused BullMQ to
    // return an already-completed job instead of enqueuing a new one after confirm.
    // Make jobId unique per enqueue to ensure re-executions actually run.
    const safeJobIdBase = `run-${runId}-mode-${run.mode}`;
    const uniqueSuffix = Date.now().toString(36);
    const safeJobId = `${safeJobIdBase}-${uniqueSuffix}`;
    try {
      const job = await this.runsQueue.add('execute', jobPayload, {
        jobId: safeJobId, // idempotency/dedupe per run+mode
        delay: opts.delayMs ?? 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      });

      // Inline health snapshot
      const [waiting, active, delayed, failed, completed] = await Promise.all([
        this.runsQueue.getWaitingCount(),
        this.runsQueue.getActiveCount(),
        this.runsQueue.getDelayedCount(),
        this.runsQueue.getFailedCount(),
        this.runsQueue.getCompletedCount(),
      ]);

      let state: string | undefined;
      try {
        const added = await this.runsQueue.getJob(String(job.id));
        state = added ? await added.getState() : undefined;
      } catch {
        // ignore
      }

      this.logger.log('✅ Job added to queue', {
        timestamp: new Date().toISOString(),
        runId,
        jobId: job.id,
        queue: 'runs',
        state,
        counts: { waiting, active, delayed, failed, completed },
      });
    } catch (err: any) {
      this.logger.error('❌ Failed to add job to queue', {
        timestamp: new Date().toISOString(),
        runId,
        error: err?.message,
      });
      throw err;
    }
  }

  /**
   * Persist planner output: planned steps into Step table and diff into run.output.
   * - Creates Step rows with action "Planned <tool>" and request set to args.
   * - Avoids duplicating if steps already exist for this run.
   */
  async persistPlan(runId: string, plan: Array<{ tool: string; args?: any }>, diff: any) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const stepCount = await this.stepsService.countStepsByRunId(runId);

    // Merge diff and plan into run.output (scratch.plan is a good place)
    const currentOutput = (run.output && typeof run.output === 'object' ? (run.output as any) : {}) as Record<string, any>;
    const nextScratch = {
      ...((currentOutput.scratch && typeof currentOutput.scratch === 'object'
        ? (currentOutput.scratch as Record<string, any>)
        : {}) as Record<string, any>),
      plan: plan ?? [],
    };
    const nextOutput = {
      ...currentOutput,
      diff: diff ?? currentOutput.diff,
      scratch: nextScratch,
    } as any;

    // Only create planned steps if no steps exist yet to avoid duplicates
    if (stepCount === 0) {
      await this.stepsService.createPlannedSteps(runId, plan, run.userId);
    }

    await this.prisma.run.update({ where: { id: runId }, data: { output: nextOutput } });

    // Persist plan as a chat item
    try {
      const run2 = await this.prisma.run.findUnique({ where: { id: runId } });
      if (run2) {
        // Find or create chat for this run
        let chat = await this.prisma.chat.findUnique({ where: { runId: runId } });
        if (!chat) {
          chat = await this.prisma.chat.create({
            data: {
              runId,
              userId: run2.userId,
              teamId: run2.teamId ?? null,
              title: String(run2.prompt || '').slice(0, 120),
            },
          });
        }
        await this.prisma.chatItem.create({
          data: {
            chatId: chat.id,
            type: 'plan',
            role: 'assistant',
            content: { plan, diff } as any,
            runId,
            userId: run2.userId,
            teamId: run2.teamId ?? null,
          },
        });
      }
    } catch (e) {
      this.logger.warn('Failed to persist plan to chat', e as any);
    }
  }

  private normalizeMessages(messages: CreateRunDto['messages'], prompt?: string): ChatMessage[] {
    const allowedRoles = new Set(['system', 'user', 'assistant', 'tool']);
    const normalized: ChatMessage[] = [];

    if (Array.isArray(messages)) {
      messages.forEach((msg) => {
        if (!msg || typeof msg.content !== 'string') return;
        const trimmed = msg.content.trim();
        if (!trimmed) return;
        const role = allowedRoles.has(msg.role) ? msg.role : 'user';
        const next: ChatMessage = { role, content: trimmed };
        if (msg.ts) next.ts = msg.ts;
        if (msg.toolName) next.toolName = msg.toolName;
        normalized.push(next);
      });
    }

    const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (trimmedPrompt) {
      const lastUser = [...normalized].reverse().find((m) => m.role === 'user');
      if (!lastUser || lastUser.content !== trimmedPrompt) {
        normalized.push({ role: 'user', content: trimmedPrompt });
      }
    }

    return normalized;
  }

  private resolvePrompt(prompt: string | undefined, messages: ChatMessage[]): string {
    if (prompt && prompt.trim().length > 0) {
      return prompt.trim();
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return lastUser?.content?.trim() ?? '';
  }

  private async buildPolicySnapshot(
    teamId: number | null,
    toolAllowlist?: string[]
  ): Promise<TeamPolicy> {
    const base = await getTeamPolicy(teamId !== null ? String(teamId) : undefined);
    const allowlist = new Set<string>(base.allowlist?.tools ?? []);
    if (Array.isArray(toolAllowlist)) {
      toolAllowlist.forEach((tool: string) => {
        if (typeof tool === 'string' && tool.trim()) allowlist.add(tool);
      });
    }
    return {
      ...base,
      allowlist: {
        ...base.allowlist,
        tools: Array.from(allowlist),
      },
    };
  }

  private initialStatusForMode(mode: string): string {
    switch (mode) {
      case 'preview':
        return 'planning';
      case 'approval':
        return 'awaiting_approval';
      case 'scheduled':
        return 'scheduled';
      case 'auto':
      default:
        return 'queued';
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private extractInputFromConfig(config: Record<string, unknown>, fallbackPrompt: string) {
    const input = this.asRecord(config.input);
    const prompt =
      typeof input.prompt === 'string' && input.prompt.trim().length > 0
        ? input.prompt
        : fallbackPrompt;
    const messages = Array.isArray(input.messages) ? (input.messages as ChatMessage[]) : undefined;
    return { prompt, messages };
  }

  private buildMetaForJob(config: Record<string, unknown>, policy: TeamPolicy | null) {
    const meta = { ...this.asRecord(config.meta) };
    if (Array.isArray(config.channelTargets)) {
      meta.channelTargets = config.channelTargets;
    }
    if (Array.isArray(config.approvedSteps)) {
      meta.approvedSteps = config.approvedSteps;
    }
    if (policy) {
      meta.policy = policy;
    }
    return meta;
  }

  private deriveScopesFromRun(
    run: { toolAllowlist: unknown },
    config: Record<string, unknown>,
    policy: TeamPolicy | null
  ): string[] {
    const scopes = new Set<string>(['runs:execute']);

    const targets = Array.isArray(config.channelTargets)
      ? (config.channelTargets as Array<any>)
      : [];
    targets.forEach((target: any) => {
      if (target && typeof target.appId === 'string') {
        scopes.add(`tool:${target.appId}`);
      }
      if (target && Array.isArray(target.scopes)) {
        target.scopes
          .filter((scope: unknown): scope is string => typeof scope === 'string')
          .forEach((scope: string) => scopes.add(scope));
      }
    });

    const allowlist = this.asRecord(run.toolAllowlist);
    if (Array.isArray(allowlist.tools)) {
      allowlist.tools
        .filter((tool: unknown): tool is string => typeof tool === 'string')
        .forEach((tool) => scopes.add(`tool:${tool}`));
    }

    if (policy?.allowlist?.scopes?.length) {
      policy.allowlist.scopes.forEach((scope) => scopes.add(scope));
    }

    return Array.from(scopes);
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
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    // Verify run is in awaiting_approval state
    if (run.status !== 'awaiting_approval') {
      throw new BadRequestException(
        `Cannot approve run with status '${run.status}'. Expected 'awaiting_approval'.`
      );
    }

    const config = this.asRecord(run.config);
    
    // Store approved steps and mark for execution continuation
    const nextConfig = { 
      ...config, 
      approvedSteps,
      // Signal to resume from executor node
      resumeFrom: 'executor' 
    };

    // Update run status to approved and persist config
    await this.prisma.run.update({
      where: { id: runId },
      data: {
        config: nextConfig,
        status: 'approved',
      },
    });

    // Get the existing scratch with plan from run output
    const rawOutput = this.asRecord(run.output);
    const existingScratch = rawOutput.scratch && typeof rawOutput.scratch === 'object' 
      ? rawOutput.scratch as Record<string, unknown>
      : {};

    // Re-enqueue with scratch data to continue execution, preserving the plan
    await this.enqueue(runId, { 
      scratch: { 
        ...existingScratch,
        approvalGranted: true,
        approvedAt: new Date().toISOString()
      } 
    });

    await this.telemetry.track('run_approved', { runId, stepsCount: approvedSteps.length });
  }

  async undoRun(runId: string) {
    const run = await this.get(runId);

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
    const run = await this.prisma.run.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Run not found');

    if (result.logs?.length) {
      await this.stepsService.createExecutedSteps(id, result.logs, run.userId);
    }

    await this.prisma.run.update({
      where: { id },
      data: { output: result.output ?? null, error: result.error ?? null },
    });

    // Persist execution logs and output as chat items
    try {
      const run2 = await this.prisma.run.findUnique({ where: { id } });
      if (run2) {
        const chat = await this.prisma.chat.findUnique({ where: { runId: id } });
        if (chat) {
          if (Array.isArray(result.logs) && result.logs.length > 0) {
            await this.prisma.chatItem.create({
              data: {
                chatId: chat.id,
                type: 'log',
                role: 'assistant',
                content: { entries: result.logs } as any,
                runId: id,
                userId: run2.userId,
                teamId: run2.teamId ?? null,
              },
            });
          }
          if (result.output) {
            await this.prisma.chatItem.create({
              data: {
                chatId: chat.id,
                type: 'output',
                role: 'assistant',
                content: result.output as any,
                runId: id,
                userId: run2.userId,
                teamId: run2.teamId ?? null,
              },
            });
          }
          if (result.error) {
            await this.prisma.chatItem.create({
              data: {
                chatId: chat.id,
                type: 'error',
                role: 'assistant',
                content: result.error as any,
                runId: id,
                userId: run2.userId,
                teamId: run2.teamId ?? null,
              },
            });
          }
        }
      }
    } catch (e) {
      this.logger.warn('Failed to persist result to chat', e as any);
    }
  }

  /**
   * Refresh credentials for planned steps on a run.
   * Re-resolves app credentials for any steps that have a known appId but null credentialId.
   */
  async refreshRunCredentials(runId: string): Promise<{ updated: number }> {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const userSub = this.current.getCurrentUserSub();
    if (!userSub) throw new UnauthorizedException('Not authenticated');
    
    // Look up the user in the database by Kinde sub field
    const user = await this.prisma.user.findFirst({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException('User not found in database');
    }

    const steps = await this.prisma.step.findMany({ where: { runId } });
    let updated = 0;

    for (const s of steps) {
      try {
        if (s.appId && (s.credentialId === null || s.credentialId === undefined)) {
          const { credentialId } = await this.stepsService.reResolveAppAndCredential(
            s.tool,
            user.id,
          );
          if (credentialId) {
            await this.prisma.step.update({ where: { id: s.id }, data: { credentialId } });
            updated += 1;
          }
        }
      } catch {
        // continue others
      }
    }

    return { updated };
  }

  /**
   * Persist user-provided answers into run.output.scratch and clear any pause flag.
   */
  async applyUserAnswers(runId: string, answers: Record<string, unknown>) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const existingOutput =
      run.output && typeof run.output === 'object' ? (run.output as Record<string, any>) : {};
    const existingScratch =
      existingOutput.scratch && typeof existingOutput.scratch === 'object'
        ? (existingOutput.scratch as Record<string, any>)
        : {};

    const existingAnswers =
      existingScratch.answers && typeof existingScratch.answers === 'object'
        ? (existingScratch.answers as Record<string, unknown>)
        : {};

    const nextScratch: Record<string, any> = {
      ...existingScratch,
      answers: { ...existingAnswers, ...(answers ?? {}) },
      awaiting: null,
    };

    const setByPath = (obj: Record<string, any>, path: string, value: unknown) => {
      if (!path || typeof path !== 'string') return;
      const parts = path.split('.');
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
      }
      cur[parts[parts.length - 1]] = value;
    };

    for (const [k, v] of Object.entries(answers ?? {})) {
      if (k.includes('.')) {
        setByPath(nextScratch, k, v);
      } else {
        nextScratch[k] = v;
      }
    }

    const {
      awaiting: _dropAwait,
      audit: existingAudit,
      ...restExistingOutput
    } = existingOutput as any;
    const ts = new Date().toISOString();
    const auditQna: any[] = [
      ...(((existingAudit ?? {}).qna ?? []) as any[]),
      { ts, runId, phase: 'answered', answers },
      { ts, runId, phase: 'validated' },
    ];

    const nextOutput = {
      ...restExistingOutput,
      scratch: nextScratch,
      audit: { ...(existingAudit ?? {}), qna: auditQna },
    };

    await this.prisma.run.update({
      where: { id: runId },
      data: { output: nextOutput as any },
    });

    await this.telemetry.track('run_confirmed', {
      runId,
      answersCount: Object.keys(answers || {}).length,
    });
  }

  async persistValidationErrors(
    runId: string,
    answers: Record<string, unknown>,
    errors: Record<string, string>
  ) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const existingOutput =
      run.output && typeof run.output === 'object' ? (run.output as Record<string, any>) : {};

    const nextAwaiting = {
      ...((existingOutput.awaiting as Record<string, any>) ?? {}),
      errors,
    };
    const ts = new Date().toISOString();
    const existingAudit = (existingOutput.audit as any) ?? {};
    const auditQna: any[] = [
      ...(((existingAudit ?? {}).qna ?? []) as any[]),
      { ts, runId, phase: 'rejected', answers, errors },
    ];

    const nextOutput = {
      ...existingOutput,
      awaiting: nextAwaiting,
      audit: { ...(existingAudit ?? {}), qna: auditQna },
    } as any;

    await this.prisma.run.update({ where: { id: runId }, data: { output: nextOutput } });
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
  }) {
    const { prompt, userId, teamId, tz, goal, plan, missing } = data;

    // Determine status based on whether there are missing inputs
    const status = missing && missing.length > 0 ? 'awaiting_input' : 'planning';

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
        userId,
      );

      this.logger.log('✅ Plan steps created', {
        runId: run.id,
        stepCount: plan.length,
      });
    }

    return run;
  }
}

