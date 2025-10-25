import { Body, Controller, Get, Param, Post, UseGuards, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { RunsService } from './runs.service';
import { KindeGuard } from '../auth/kinde.guard';
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
  mode: 'plan' | 'auto' | 'scheduled';
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
  constructor(private runs: RunsService) { }

  @Post()
  create(@Body() body: CreateRunDto, @Req() req: any) {
    const claims = req.user || {};
    return this.runs.createFromPrompt(body, claims);
  }

  @Post(':id/confirm')
  async confirm(@Param('id') id: string, @Body() body: ConfirmDto) {
    const run = await this.runs.get(id);
    if (!run) throw new NotFoundException('Run not found');

    const questions = (run.output as any)?.diff?.questions ?? (run.output as any)?.questions ?? [];
    const { ok, errors } = validateAnswers(questions, body?.answers ?? {});
    if (!ok) {
      return new BadRequestException({ message: 'Validation failed', validationErrors: errors });
    }

    await this.runs.applyUserAnswers(id, body.answers!);
    await this.runs.enqueue(id); // re-run with answers
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

  @Get(':id')
  get(@Param('id') id: string) {
    return this.runs.get(id);
  }
}
