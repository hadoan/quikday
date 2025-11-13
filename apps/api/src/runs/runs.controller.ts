import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { RunsService } from './runs.service.js';
import { KindeGuard } from '../auth/kinde.guard.js';
import { validateAnswers } from '@quikday/agent/validation/answers';
import { RunStatus } from '@prisma/client';

export interface ChatMessageDto {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  ts?: string;
  toolName?: string;
}

export interface CreateRunDto {
  prompt?: string;
  messages?: ChatMessageDto[];
  mode: 'preview' | 'approval' | 'auto' | 'scheduled';
  teamId: number;
  scheduledAt?: string;
  channelTargets?: Array<{
    appId: string;
    credentialId?: number;
  }>;
  toolAllowlist?: string[];
  meta?: Record<string, unknown>;
}

export interface ConfirmDto {
  answers?: Record<string, unknown>;
  approve?: boolean;
}

export interface RetrieveRunDto {
  update_credential?: boolean;
}

@Controller('runs')
@UseGuards(KindeGuard)
export class RunsController {
  private readonly logger = new Logger(RunsController.name);

  constructor(private runs: RunsService) {}

  @Get()
  async list(@Req() _req: any) {
    // Parse query params; Nest can bind DTO but keep simple here
    const req: any = _req;
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    const q = req.query?.q as string | undefined;
    const page = req.query?.page ? Number(req.query.page) : undefined;
    const pageSize = req.query?.pageSize ? Number(req.query.pageSize) : undefined;
    const sortBy = req.query?.sortBy as string | undefined as any;
    const sortDir = req.query?.sortDir as string | undefined as any;
    const rawStatuses = ([] as string[])
      .concat(req.query?.status ?? [])
      .filter(Boolean)
      .map((value) => value.toString().toLowerCase());
    const allowedStatuses = new Set<RunStatus>(Object.values(RunStatus) as RunStatus[]);
    const status = rawStatuses.reduce<RunStatus[]>((acc, value) => {
      if (allowedStatuses.has(value as RunStatus)) {
        acc.push(value as RunStatus);
      }
      return acc;
    }, []);

    return this.runs.list({ userId, page, pageSize, q, status, sortBy, sortDir });
  }

  @Post()
  create(@Body() body: CreateRunDto, @Req() req: any) {
    const claims = req.user || {};
    return this.runs.createFromPrompt(body, claims);
  }

  @Post(':id/confirm')
  async confirm(@Param('id') id: string, @Body() body: ConfirmDto, @Req() req: any) {
    const who = req?.user ? req.user.email || req.user.sub || 'unknown-user' : 'unauthenticated';
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    this.logger.log(`POST /runs/${id}/confirm requested by ${who}`);
    this.logger.debug(
      `Incoming confirm payload: ${JSON.stringify({ answersKeys: Object.keys(body?.answers ?? {}), approve: body?.approve ?? undefined })}`
    );

    const run = await this.runs.get(id, userId);
    if (!run) {
      this.logger.warn(`Run not found for id=${id}`);
      throw new NotFoundException('Run not found');
    }

    const questions =
      (run.output as any)?.awaiting?.questions ?? (run.output as any)?.diff?.questions ?? [];

    this.logger.debug(`Validating answers for run=${id}. expectedQuestions=${questions.length}`);
    const { ok, errors, normalized } = validateAnswers(questions, body?.answers ?? {});

    if (!ok) {
      this.logger.warn(`Validation failed for run=${id}. errors=${JSON.stringify(errors)}`);
      // Persist UI mirror errors + audit and respond with structured errors
      await this.runs.persistValidationErrors(id, body?.answers ?? {}, errors);
      throw new BadRequestException({ message: 'Validation failed', validationErrors: errors });
    }

    this.logger.debug(
      `Applying validated answers for run=${id}. normalizedKeys=${Object.keys(normalized || {})}`
    );
    await this.runs.applyUserAnswers(id, normalized);

    this.logger.log(`Enqueuing run re-execution for id=${id}`);
    await this.runs.enqueue(id); // re-run with answers
    this.logger.log(`Confirm completed for run=${id}`);
    return { ok: true };
  }

  @Post(':id/continueWithAnswers')
  async continueWithAnswers(
    @Param('id') id: string,
    @Body() body: { answers?: Record<string, unknown> | null },
    @Req() req: any
  ) {
    const who = req?.user ? req.user.email || req.user.sub || 'unknown-user' : 'unauthenticated';
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    this.logger.log(`POST /runs/${id}/continueWithAnswers requested by ${who}`);
    this.logger.debug(
      `Incoming answers payload: ${JSON.stringify({ answersKeys: Object.keys(body?.answers ?? {}) })}`
    );

    const run = await this.runs.get(id, userId);
    if (!run) {
      this.logger.warn(`Run not found for id=${id}`);
      throw new NotFoundException('Run not found');
    }

    // Get missing fields from the run
    const missing = Array.isArray(run.missing) ? run.missing : [];

    this.logger.debug(`Validating answers for run=${id}. expectedFields=${missing.length}`);

    // If no answers were provided (null/undefined/empty), skip saving and
    // skip the "missing required fields" validation. This allows callers to
    // call this endpoint without answers when they simply want to continue
    // execution. If answers are present, validate that required missing
    // keys are included (we do NOT validate non-empty values).
    const providedAnswers = body?.answers ?? null;
    const providedKeys =
      providedAnswers && typeof providedAnswers === 'object' ? Object.keys(providedAnswers) : [];

    if (!providedAnswers || providedKeys.length === 0) {
      this.logger.debug(`No answers provided for run=${id}; skipping save and validation.`);
    } else {
      // Validate that all required missing fields have answers (presence only)
      const requiredMissing = missing.filter((m: any) => m.required !== false);
      const missingRequired = requiredMissing.filter((m: any) => !providedKeys.includes(m.key));

      if (missingRequired.length > 0) {
        const missingKeys = missingRequired.map((m: any) => m.key);
        this.logger.warn(`Missing required fields for run=${id}: ${missingKeys.join(', ')}`);
        throw new BadRequestException({
          message: 'Missing required fields',
          missingFields: missingKeys,
        });
      }

      // Validate that required fields do not have blank/empty values
      const requiredKeys = requiredMissing.map((m: any) => m.key);
      const blankRequired = requiredKeys.filter((key: string) => {
        const value = providedAnswers[key];
        // Treat null, undefined, empty string, or whitespace-only string as blank
        if (value == null) return true;
        if (typeof value === 'string' && value.trim() === '') return true;
        return false;
      });

      if (blankRequired.length > 0) {
        this.logger.warn(
          `Blank values for required fields in run=${id}: ${blankRequired.join(', ')}`
        );
        throw new BadRequestException({
          message: 'Required fields cannot be blank',
          blankFields: blankRequired,
        });
      }

      this.logger.debug(`Storing answers for run=${id}. answersKeys=${providedKeys.join(', ')}`);
      // Store answers in the answers field
      await this.runs.storeAnswers(id, providedAnswers as Record<string, unknown>);
    }

    // Execute the plan (with or without new answers)
    this.logger.log(
      `Executing plan for run=${id}${providedKeys.length ? ' with provided answers' : ''}`
    );
    await this.runs.executePlanWithAnswers(id);

    this.logger.log(`Submit continueWithAnswers completed for run=${id}`);
    return { ok: true };
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() body: { approvedSteps: string[] },
    @Req() req: any
  ) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    // Verify ownership before approving
    await this.runs.get(id, userId);
    await this.runs.approveSteps(id, body.approvedSteps);
    return { ok: true };
  }

  @Post(':id/undo')
  async undo(@Param('id') id: string, @Req() req: any) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    // Verify ownership before undoing
    await this.runs.get(id, userId);
    await this.runs.undoRun(id);
    return { ok: true };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Req() req: any) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    // Verify ownership before canceling
    await this.runs.get(id, userId);
    await this.runs.cancel(id);
    return { ok: true };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    return this.runs.get(id, userId);
  }

  @Get(':id/chatItems/:chatItemId')
  async getChatItem(
    @Param('id') id: string,
    @Param('chatItemId') chatItemId: string,
    @Req() req: any
  ) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    return this.runs.getChatItem(id, chatItemId, userId);
  }

  @Post(':id/retrieve')
  async retrieve(
    @Param('id') id: string,
    @Body() body: RetrieveRunDto,
    @Req() req: any
  ) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    const run = await this.runs.get(id, userId);

    // If update_credential is true, refresh credentials in chat items
    if (body.update_credential === true) {
      await this.runs.updateChatItemCredentials(id);
    }

    return run;
  }

  @Post(':id/refresh-credentials')
  async refreshCredentials(@Param('id') id: string, @Req() req: any) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    // Verify ownership before refreshing credentials
    await this.runs.get(id, userId);
    const result = await this.runs.refreshRunCredentials(id);
    return { ok: true, ...result };
  }

  @Post(':id/set-pending-apps-install')
  async setPendingAppsInstall(@Param('id') id: string, @Req() req: any) {
    const claims = req.user || {};
    const userId = claims.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in claims');
    }

    // Verify ownership
    await this.runs.get(id, userId);

    await this.runs.updateStatus(id, RunStatus.PENDING_APPS_INSTALL);
    this.logger.log(`Run ${id} marked as pending_apps_install by user ${userId}`);
    return { ok: true };
  }
}
