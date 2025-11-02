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

@Controller('runs')
@UseGuards(KindeGuard)
export class RunsController {
  private readonly logger = new Logger(RunsController.name);

  constructor(private runs: RunsService) {}

  @Get()
  async list(@Req() _req: any) {
    // Parse query params; Nest can bind DTO but keep simple here
    const req: any = _req;
    const q = req.query?.q as string | undefined;
    const page = req.query?.page ? Number(req.query.page) : undefined;
    const pageSize = req.query?.pageSize ? Number(req.query.pageSize) : undefined;
    const sortBy = (req.query?.sortBy as string | undefined) as any;
    const sortDir = (req.query?.sortDir as string | undefined) as any;
    const status = ([] as string[]).concat(req.query?.status ?? []).filter(Boolean);
    return this.runs.list({ page, pageSize, q, status, sortBy, sortDir });
  }

  @Post()
  create(@Body() body: CreateRunDto, @Req() req: any) {
    const claims = req.user || {};
    return this.runs.createFromPrompt(body, claims);
  }

  @Post(':id/confirm')
  async confirm(@Param('id') id: string, @Body() body: ConfirmDto, @Req() req: any) {
    const who = req?.user ? req.user.email || req.user.sub || 'unknown-user' : 'unauthenticated';
    this.logger.log(`POST /runs/${id}/confirm requested by ${who}`);
    this.logger.debug(
      `Incoming confirm payload: ${JSON.stringify({ answersKeys: Object.keys(body?.answers ?? {}), approve: body?.approve ?? undefined })}`
    );

    const run = await this.runs.get(id);
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

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() body: { approvedSteps: string[] }) {
    await this.runs.approveSteps(id, body.approvedSteps);
    return { ok: true };
  }

  @Post(':id/undo')
  async undo(@Param('id') id: string) {
    await this.runs.undoRun(id);
    return { ok: true };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    await this.runs.cancel(id);
    return { ok: true };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.runs.get(id);
  }
}
