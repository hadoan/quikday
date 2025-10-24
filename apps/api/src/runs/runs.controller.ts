import { Body, Controller, Get, Param, Post, UseGuards, Req } from '@nestjs/common';
import { RunsService } from './runs.service';
import { KindeGuard } from '../auth/kinde.guard';

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
  constructor(private runs: RunsService) {}

  @Post()
  create(@Body() body: CreateRunDto, @Req() req: any) {
    const claims = req.user || {};
    return this.runs.createFromPrompt(body, claims);
  }

  @Post(':id/confirm')
  async confirm(@Param('id') id: string, @Body() body: ConfirmDto) {
    const answers = body?.answers ?? {};

    // Persist the provided answers so the resumed run can access them
    await this.runs.applyUserAnswers(id, answers);

    // Mark run as queued so it's visible to workers and UI
    await this.runs.updateStatus(id, 'queued');

    // Re-enqueue the run and include the answers as scratch so the worker
    // initialises the graph with these values available in runtime.scratch
    await this.runs.enqueue(id, { scratch: answers });
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
