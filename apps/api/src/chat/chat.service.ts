import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PlanCard, ConfigCard, RunCard } from '@runfast/types';
import { RunsService } from '../runs/runs.service';

@Injectable()
export class ChatService {
  constructor(private runs: RunsService) {}

  async handlePrompt({
    prompt,
    mode,
    teamId,
  }: {
    prompt: string;
    mode: 'plan' | 'auto';
    teamId: number;
  }) {
    const run = await this.runs.createFromPrompt({ prompt, mode, teamId });

    const plan: z.infer<typeof PlanCard> = {
      type: 'plan',
      intent: 'schedule_post',
      tools: ['linkedin'],
      actions: ['create_draft', 'schedule'],
      mode,
    };
    const cfg: z.infer<typeof ConfigCard> = {
      type: 'config',
      fields: { platform: 'linkedin', time: '2025-10-18T07:00:00Z', audience: 'public' },
      suggestions: ['09:00 local time', 'Add first comment'],
    };

    if (mode === 'plan') return { messages: [plan, cfg] };
    await this.runs.enqueue(run.id);
    const runCard: z.infer<typeof RunCard> = { type: 'run', status: 'queued' };
    return { messages: [plan, cfg, runCard] };
  }
}
