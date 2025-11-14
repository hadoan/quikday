import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { RunTokenService } from './run-token.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CurrentUserService, getCurrentUserCtx } from '@quikday/libs';
import { StepsService } from './steps.service.js';
import { ChatItemOrchestratorService } from './chat-item-orchestrator.service.js';
import { ChatService } from './chat.service.js';
import { RunQueryService } from './run-query.service.js';
import { RunStatus, type Step } from '@prisma/client';
import type { Goal, PlanStep } from './types.js';
import type { TeamPolicy } from '@quikday/agent/guards/policy';
import {
  asRecord,
  buildMetaForJob,
  deriveScopesFromRun,
  extractInputFromConfig,
  jsonClone,
} from './utils/run-helpers.js';

@Injectable()
export class RunWorkflowService {
  private readonly logger = new Logger(RunWorkflowService.name);

  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService,
    private tokens: RunTokenService,
    @InjectQueue('runs') private runsQueue: Queue,
    private readonly current: CurrentUserService,
    private readonly stepsService: StepsService,
    private readonly chatItemOrchestrator: ChatItemOrchestratorService,
    private readonly chatService: ChatService,
    private readonly queryService: RunQueryService
  ) {}

  async enqueue(
    runId: string,
    opts: { delayMs?: number; scratch?: Record<string, unknown> } = {}
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

    const config = asRecord(run.config);
    const input = extractInputFromConfig(config, run.prompt);
    const policy = (run.policySnapshot as TeamPolicy | null) ?? null;
    const meta = buildMetaForJob(config, policy);
    const scopes = deriveScopesFromRun(run, config, policy);

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

    const userSub = this.current.getCurrentUserSub();
    if (!userSub) throw new UnauthorizedException('Not authenticated.');

    const __ctx = jsonClone(getCurrentUserCtx());
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

    const safeJobIdBase = `run-${runId}-mode-${run.mode}`;
    const uniqueSuffix = Date.now().toString(36);
    const safeJobId = `${safeJobIdBase}-${uniqueSuffix}`;
    try {
      const job = await this.runsQueue.add('execute', jobPayload, {
        jobId: safeJobId,
        delay: opts.delayMs ?? 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      });

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

  async persistPlan(runId: string, plan: Array<{ tool: string; args?: any }>, diff: any) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const stepCount = await this.stepsService.countStepsByRunId(runId);
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

    if (stepCount === 0) {
      await this.stepsService.createPlannedSteps(runId, plan, run.userId);
    }

    await this.prisma.run.update({ where: { id: runId }, data: { output: nextOutput } });

    try {
      const run2 = await this.prisma.run.findUnique({ where: { id: runId } });
      if (run2) {
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

  async approveSteps(runId: string, approvedSteps: string[]) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    if (run.status !== RunStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve run with status '${run.status}'. Expected 'awaiting_approval'.`
      );
    }

    const config = asRecord(run.config);
    const nextConfig = {
      ...config,
      approvedSteps,
      resumeFrom: 'executor',
    };

    await this.prisma.run.update({
      where: { id: runId },
      data: {
        config: nextConfig,
        status: RunStatus.APPROVED,
      },
    });

    const rawOutput = asRecord(run.output);
    const existingScratch =
      rawOutput.scratch && typeof rawOutput.scratch === 'object'
        ? (rawOutput.scratch as Record<string, unknown>)
        : {};

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
    await this.queryService.get(runId);

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

  async refreshRunCredentials(runId: string): Promise<{ updated: number }> {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const userSub = this.current.getCurrentUserSub();
    if (!userSub) throw new UnauthorizedException('Not authenticated');

    const user = await this.prisma.user.findFirst({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException('User not found in database');
    }

    const {
      updated,
      steps: postSteps,
      missingCredSteps,
    } = await this.reResolveRunStepCredentials(runId, user.id);

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

    try {
      const latest = await this.prisma.run.findUnique({ where: { id: runId } });
      if (latest && latest.status === RunStatus.PENDING_APPS_INSTALL && missingCredSteps.length === 0) {
        const hasPendingQuestions =
          latest.missing && Array.isArray(latest.missing) && latest.missing.length > 0;

        if (hasPendingQuestions) {
          this.logger.log('Apps installed; transitioning to awaiting_input for questions', {
            runId,
          });
          await this.prisma.run.update({
            where: { id: runId },
            data: { status: RunStatus.AWAITING_INPUT },
          });
        } else {
          this.logger.log('All required credentials present; resuming run', { runId });
          await this.executePlanWithAnswers(runId);
        }
      }
    } catch (e) {
      this.logger.warn('Failed to auto-resume run after refresh credentials', e as any);
    }

    return { updated };
  }

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

  async storeAnswers(runId: string, answers: Record<string, unknown>) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

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
        status: RunStatus.PENDING,
      },
    });

    return mergedAnswers;
  }

  async executePlanWithAnswers(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: { steps: true },
    });

    if (!run) throw new NotFoundException('Run not found');

    const goal = run.goal && typeof run.goal === 'object' ? (run.goal as Goal) : null;
    const rawPlan = Array.isArray(run.plan) ? (run.plan as Array<PlanStep | null>) : [];
    const planSteps = rawPlan.filter(
      (step): step is PlanStep => !!step && typeof step === 'object' && 'tool' in step
    );
    const answers =
      run.answers && typeof run.answers === 'object'
        ? (run.answers as Record<string, unknown>)
        : {};
    const steps = Array.isArray(run.steps) ? run.steps : [];

    const stepsByPlanId = new Map<string, Step>();
    steps.forEach((step) => {
      if (step.planStepId) {
        stepsByPlanId.set(step.planStepId, step);
      }
    });

    const credentialIds = new Set<number>();
    planSteps.forEach((planStep) => {
      if (typeof planStep.credentialId === 'number') credentialIds.add(planStep.credentialId);
    });
    steps.forEach((step) => {
      if (typeof step.credentialId === 'number') credentialIds.add(step.credentialId);
    });

    const credentialRecords = credentialIds.size
      ? await this.prisma.credential.findMany({
          where: { id: { in: Array.from(credentialIds) } },
        })
      : [];
    const credentialMap = new Map<
      number,
      {
        id: number;
        appId: string;
        type: string;
        key: Record<string, unknown> | unknown[] | null;
        userId: number | null;
        teamId: number | null;
        emailOrUserName: string | null;
        avatarUrl: string | null;
        name: string | null;
        tokenExpiresAt: string | null;
        vendorAccountId: string | null;
      }
    >();
    credentialRecords.forEach((cred) => {
      credentialMap.set(cred.id, {
        id: cred.id,
        appId: cred.appId,
        type: cred.type,
        key: jsonClone(cred.key ?? null) as Record<string, unknown> | unknown[] | null,
        userId: cred.userId ?? null,
        teamId: cred.teamId ?? null,
        emailOrUserName: cred.emailOrUserName ?? null,
        avatarUrl: cred.avatarUrl ?? null,
        name: cred.name ?? null,
        tokenExpiresAt: cred.tokenExpiresAt ? cred.tokenExpiresAt.toISOString() : null,
        vendorAccountId: cred.vendorAccountId ?? null,
      });
    });

    const resolveCredential = (credentialId?: number | null) => {
      if (!credentialId) return null;
      const cred = credentialMap.get(credentialId);
      return cred ? jsonClone(cred) : null;
    };

    const toolContexts =
      planSteps.length > 0
        ? planSteps.map((planStep) => {
            const linkedStep = planStep.id ? stepsByPlanId.get(planStep.id) : undefined;
            const linkedCredentialId =
              linkedStep?.credentialId ??
              (typeof planStep.credentialId === 'number' ? planStep.credentialId : null);
            return {
              planStepId: planStep.id ?? null,
              stepId: linkedStep?.id ?? null,
              tool: planStep.tool,
              appId: linkedStep?.appId ?? planStep.appId ?? null,
              credentialId: linkedCredentialId,
              credential: resolveCredential(linkedCredentialId),
              userId: run.userId,
            };
          })
        : steps.map((step) => ({
            planStepId: step.planStepId ?? null,
            stepId: step.id,
            tool: step.tool,
            appId: step.appId ?? null,
            credentialId: step.credentialId ?? null,
            credential: resolveCredential(step.credentialId ?? null),
            userId: run.userId,
          }));

    this.logger.log('🚀 Executing plan with answers', {
      runId,
      planSteps: planSteps.length,
      answerKeys: Object.keys(answers),
    });

    const user = await this.prisma.user.findUnique({ where: { id: run.userId } });
    const tz = user?.timeZone || 'UTC';

    const scratch = {
      goal,
      plan: rawPlan,
      answers,
      awaiting: null,
      tools: toolContexts,
    };

    const existingConfig =
      run.config && typeof run.config === 'object' ? (run.config as Record<string, unknown>) : {};

    await this.prisma.run.update({
      where: { id: runId },
      data: {
        status: RunStatus.PENDING,
        config: {
          ...existingConfig,
          resumeFrom: 'executor',
          tz,
        } as any,
      },
    });

    await this.enqueue(runId, { scratch });

    this.logger.log('✅ Plan execution enqueued with resumeFrom=executor', { runId });
  }

  async getChatItem(runId: string, chatItemId: string, userSub: string) {
    await this.queryService.get(runId, userSub);

    const chatItem = await this.prisma.chatItem.findFirst({
      where: {
        id: chatItemId,
        hideInChat: false,
      },
    });
    if (!chatItem || chatItem.runId !== runId) {
      throw new NotFoundException('Chat item not found');
    }
    return chatItem;
  }

  async hideQuestionChatItems(runId: string) {
    const result = await this.prisma.chatItem.updateMany({
      where: {
        runId,
        type: 'questions',
        hideInChat: false,
      },
      data: {
        hideInChat: true,
      },
    });

    this.logger.debug('🙈 Hid questions chat items', {
      runId,
      updated: result.count,
    });

    return result.count;
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
}
