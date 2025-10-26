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
import { TelemetryService } from '../telemetry/telemetry.service';
import { CreateRunDto } from './runs.controller';
import { RunTokenService } from './run-token.service';
import { getTeamPolicy, type TeamPolicy } from '@quikday/agent/guards/policy';
import type { ChatMessage } from '@quikday/agent/state/types';
import { CurrentUserService, getCurrentUserCtx } from '@quikday/libs';

@Injectable()
export class RunsService {
  private isNoLog = true;
  private readonly logger =
    this.isNoLog === true
      ? ({
          log: (_: any, __?: any) => {},
          debug: (_: any, __?: any) => { /* no-op */ },
          warn: (_: any, __?: any) => {},
          error: (_: any, __?: any) => {},
        } as unknown as Logger)
      : new Logger(RunsService.name);

  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService,
    private tokens: RunTokenService,
    @InjectQueue('runs') private runsQueue: Queue,
    private readonly current: CurrentUserService,
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

    if (mode === 'auto') {
      this.logger.log('🚀 Auto-enqueueing run (mode=auto)', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });
      await this.enqueue(run.id);
    }

    if (mode === 'scheduled' && scheduledAt) {
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

  async enqueue(
    runId: string,
    opts: { delayMs?: number; scratch?: Record<string, unknown> } = {},
  ) {
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
    const userId = this.current.getCurrentUserId();
    const teamId = this.current.getCurrentTeamId();
    if (!userId) throw new UnauthorizedException('Not authenticated.');
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

    // BullMQ does not allow ':' in custom jobId. Use hyphens instead for idempotency key.
    const safeJobId = `run-${runId}-mode-${run.mode}`;
    const job = await this.runsQueue.add('execute', jobPayload, {
      jobId: safeJobId, // idempotency/dedupe per run+mode
      delay: opts.delayMs ?? 0,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    this.logger.log('✅ Job added to queue', {
      timestamp: new Date().toISOString(),
      runId,
      jobId: job.id,
      queue: 'runs',
    });
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
    toolAllowlist?: string[],
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
      case 'plan':
        return 'planning';
      case 'scheduled':
        return 'scheduled';
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
    policy: TeamPolicy | null,
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

    const config = this.asRecord(run.config);
    const nextConfig = { ...config, approvedSteps };

    await this.prisma.run.update({
      where: { id: runId },
      data: {
        config: nextConfig,
        status: 'queued',
      },
    });

    await this.enqueue(runId);

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
            endedAt: entry.completedAt ? new Date(entry.completedAt) : undefined,
          },
        });
      }
    }
    await this.prisma.run.update({
      where: { id },
      data: { output: result.output ?? null, error: result.error ?? null },
    });
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

    const { awaiting: _dropAwait, audit: existingAudit, ...restExistingOutput } =
      existingOutput as any;
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
    errors: Record<string, string>,
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
}
