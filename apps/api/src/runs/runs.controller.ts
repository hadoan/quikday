import { Body, Controller, Get, Param, Post, UseGuards, Req } from '@nestjs/common';
import { RunsService } from './runs.service';
import { KindeGuard } from '../auth/kinde.guard';

export interface CreateRunDto {
  prompt: string;
  mode: 'plan' | 'auto' | 'scheduled';
  teamId: number;
  scheduledAt?: string;
  channelTargets?: Array<{
    appId: string;
    credentialId?: number;
  }>;
  toolAllowlist?: string[];
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
  async confirm(@Param('id') id: string) {
    await this.runs.enqueue(id);
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
