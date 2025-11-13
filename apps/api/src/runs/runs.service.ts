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
import { ChatItemOrchestratorService } from './chat-item-orchestrator.service.js';
import { ChatService } from './chat.service.js';
import { RunEnrichmentService } from './run-enrichment.service.js';
import { RunCreationService } from './run-creation.service.js';
import { RunQueryService } from './run-query.service.js';
import { RunAuthorizationService } from './run-authorization.service.js';
import { RunStatus, type Step } from '@prisma/client';
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
    private readonly chatItemOrchestrator: ChatItemOrchestratorService,
    private readonly enrichmentService: RunEnrichmentService,
    private readonly creationService: RunCreationService,
    private readonly queryService: RunQueryService,
    private readonly authService: RunAuthorizationService,
    private readonly chatService: ChatService
  ) { }

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
    const currentOutput = (
      run.output && typeof run.output === 'object' ? (run.output as any) : {}
    ) as Record<string, any>;
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

    // Persist plan as chat items using orchestrator service
    try {
      const run2 = await this.prisma.run.findUnique({ where: { id: runId } });
      if (run2) {
        // Use orchestrator to create all chat items
        await this.chatItemOrchestrator.createChatItemsForRun({
          runId,
          userId: run2.userId,
          teamId: run2.teamId ?? null,
          prompt: String(run2.prompt || ''),
          goal: (run2.goal as any) ?? null,
          plan: plan ?? [],
          missing: ((run2.missing as any) ?? []) as any[],
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

  private initialStatusForMode(mode: string): RunStatus {
    switch (mode) {
      case 'preview':
        return RunStatus.PLANNING;
      case 'approval':
        return RunStatus.AWAITING_APPROVAL;
      case 'scheduled':
        return RunStatus.SCHEDULED;
      case 'auto':
      default:
        return RunStatus.QUEUED;
    }
  }

  // getUserIdentity moved to CurrentUserService; use that instead.

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

  async get(id: string, userSub?: string) {
    return this.queryService.get(id, userSub);
  }

  async updateStatus(id: string, status: RunStatus) {
    return this.prisma.run.update({ where: { id }, data: { status } });
  }

  async approveSteps(runId: string, approvedSteps: string[]) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    // Verify run is in awaiting_approval state
    if (run.status !== RunStatus.AWAITING_APPROVAL) {
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
      resumeFrom: 'executor',
    };

    // Update run status to approved and persist config
    await this.prisma.run.update({
      where: { id: runId },
      data: {
        config: nextConfig,
        status: RunStatus.APPROVED,
      },
    });

    // Get the existing scratch with plan from run output
    const rawOutput = this.asRecord(run.output);
    const existingScratch =
      rawOutput.scratch && typeof rawOutput.scratch === 'object'
        ? (rawOutput.scratch as Record<string, unknown>)
        : {};

    // Re-enqueue with scratch data to continue execution, preserving the plan
    await this.enqueue(runId, {
      scratch: {
        ...existingScratch,
        approvalGranted: true,
        approvedAt: new Date().toISOString(),
      },
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
            await this.chatService.createLogChatItem(
              chat.id,
              id,
              run2.userId,
              run2.teamId ?? null,
              result.logs
            );
          }
          if (result.output) {
            await this.chatService.createOutputChatItem(
              chat.id,
              id,
              run2.userId,
              run2.teamId ?? null,
              result.output
            );
          }
          if (result.error) {
            await this.chatService.createErrorChatItem(
              chat.id,
              id,
              run2.userId,
              run2.teamId ?? null,
              result.error
            );
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

    const {
      updated,
      steps: postSteps,
      missingCredSteps,
    } = await this.reResolveRunStepCredentials(runId, user.id);

    // Update run.plan JSON to reflect the updated credentialIds
    if (updated > 0) {
      const currentPlan = run.plan as any[] | null;
      if (Array.isArray(currentPlan)) {
        const updatedPlan = currentPlan.map((planStep) => {
          const matchingStep = postSteps.find(
            (s) =>
              s.id === planStep.id ||
              s.planStepId === planStep.id ||
              s.planStepId === planStep.stepId
          );
          if (matchingStep && matchingStep.credentialId) {
            return { ...planStep, credentialId: matchingStep.credentialId };
          }
          return planStep;
        });
        await this.prisma.run.update({
          where: { id: runId },
          data: { plan: updatedPlan as any },
        });
      }
    }

    // If the run was waiting on app installs (pending_apps_install) and all
    // required credentials are now present, check if we should resume or transition
    // to awaiting_input.
    try {
      const run = await this.prisma.run.findUnique({ where: { id: runId } });
      if (run && run.status === RunStatus.PENDING_APPS_INSTALL && missingCredSteps.length === 0) {
        // Credentials are complete. Check if there are still missing inputs (questions).
        const hasPendingQuestions =
          run.missing && Array.isArray(run.missing) && run.missing.length > 0;

        if (hasPendingQuestions) {
          // Sequential flow: apps installed, now transition to awaiting_input for questions
          this.logger.log('Apps installed; transitioning to awaiting_input for questions', {
            runId,
          });
          await this.prisma.run.update({
            where: { id: runId },
            data: { status: RunStatus.AWAITING_INPUT },
          });
        } else {
          // No questions remaining - auto-resume execution
          this.logger.log('All required credentials present; resuming run', { runId });
          await this.executePlanWithAnswers(runId);
        }
      }
    } catch (e) {
      this.logger.warn('Failed to auto-resume run after refresh credentials', e as any);
    }

    return { updated };
  }

  /**
   * Update credentialId in chat items of type 'app_credentials' for a given run.
   * Now uses the same step re-resolution logic so that chat hydration reflects the latest data.
   */
  async updateChatItemCredentials(runId: string): Promise<{ updated: number }> {
    const userSub = this.current.getCurrentUserSub();
    if (!userSub) throw new UnauthorizedException('Not authenticated');

    const user = await this.prisma.user.findFirst({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException('User not found in database');
    }

    const { updated } = await this.reResolveRunStepCredentials(runId, user.id);
    this.logger.log(`Re-resolved step credentials for chat hydration on run ${runId}`, { updated });
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


  private async reResolveRunStepCredentials(
    runId: string,
    userId: number
  ): Promise<{
    updated: number;
    steps: Step[];
    missingCredSteps: Step[];
  }> {
    const steps = await this.prisma.step.findMany({ where: { runId } });
    let updated = 0;

    for (const step of steps) {
      if (!step.appId || (step.credentialId !== null && step.credentialId !== undefined)) {
        continue;
      }
      try {
        const { credentialId } = await this.stepsService.reResolveAppAndCredential(
          step.tool,
          userId
        );
        if (!credentialId) continue;
        await this.prisma.step.update({ where: { id: step.id }, data: { credentialId } });
        updated += 1;
      } catch (err) {
        this.logger.debug('Failed to re-resolve credential for step', {
          stepId: step.id,
          err,
        });
      }
    }

    const postSteps = await this.prisma.step.findMany({ where: { runId } });
    const missingCredSteps = postSteps.filter(
      (st) => st.appId && (st.credentialId === null || st.credentialId === undefined)
    );

    return { updated, steps: postSteps, missingCredSteps };
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
    no_ws_socket_notify?: boolean;
  }) {
    return this.creationService.createPlanRun(data);
  }

  /**
   * Store user-provided answers to missing input fields in the answers column
   */
  async storeAnswers(runId: string, answers: Record<string, unknown>) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    // Merge with existing answers if any
    const existingAnswers =
      run.answers && typeof run.answers === 'object'
        ? (run.answers as Record<string, unknown>)
        : {};

    const mergedAnswers = { ...existingAnswers, ...answers };

    this.logger.log('💾 Storing answers', {
      runId,
      answerKeys: Object.keys(answers),
      totalAnswers: Object.keys(mergedAnswers).length,
    });

    await this.prisma.run.update({
      where: { id: runId },
      data: {
        answers: mergedAnswers as any,
        status: RunStatus.PENDING, // Ready to execute
      },
    });

    return mergedAnswers;
  }

  /**
   * Execute the plan with provided answers by reconstructing state and running from executor node
   */
  async executePlanWithAnswers(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: { steps: true },
    });

    if (!run) throw new NotFoundException('Run not found');

    const goal = run.goal && typeof run.goal === 'object' ? run.goal : null;
    const plan = Array.isArray(run.plan) ? run.plan : [];
    const answers =
      run.answers && typeof run.answers === 'object'
        ? (run.answers as Record<string, unknown>)
        : {};

    this.logger.log('🚀 Executing plan with answers', {
      runId,
      planSteps: plan.length,
      answerKeys: Object.keys(answers),
    });

    // Get user for timezone
    const user = await this.prisma.user.findUnique({ where: { id: run.userId } });
    const tz = user?.timeZone || 'UTC';

    // Reconstruct the run state with answers
    const scratch = {
      goal,
      plan,
      answers,
      awaiting: null, // Clear awaiting state
    };

    // Update config to signal resume from executor
    const existingConfig =
      run.config && typeof run.config === 'object' ? (run.config as Record<string, unknown>) : {};

    await this.prisma.run.update({
      where: { id: runId },
      data: {
        status: RunStatus.PENDING,
        config: {
          ...existingConfig,
          resumeFrom: 'executor', // Signal to processor to resume from executor
          tz,
        } as any,
      },
    });

    // Enqueue the run for execution with the reconstructed scratch state
    await this.enqueue(runId, { scratch });

    this.logger.log('✅ Plan execution enqueued with resumeFrom=executor', { runId });
  }

  async getChatItem(runId: string, chatItemId: string, userSub: string) {
    await this.get(runId, userSub);

    const chatItem = await this.prisma.chatItem.findUnique({ where: { id: chatItemId } });
    if (!chatItem || chatItem.runId !== runId) {
      throw new NotFoundException('Chat item not found');
    }
    return chatItem;
  }
}
