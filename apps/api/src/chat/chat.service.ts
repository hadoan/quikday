import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PlanCard, ConfigCard, RunCard } from '@quikday/types';
import { runAgent } from '@quikday/agent';
import { RunsService } from '../runs/runs.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

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
    this.logger.log('🎯 Processing prompt', {
      timestamp: new Date().toISOString(),
      mode,
      teamId,
      promptLength: prompt.length,
    });

    this.logger.log('📝 Creating run from prompt', {
      timestamp: new Date().toISOString(),
    });

    const run = await this.runs.createFromPrompt({ prompt, mode, teamId });

    this.logger.log('✅ Run created', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      status: run.status,
    });

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

    if (mode === 'plan') {
      this.logger.log('📋 Returning plan mode response', {
        timestamp: new Date().toISOString(),
      });
      return { messages: [plan, cfg] };
    }

    this.logger.log('⚡ Enqueueing run for execution', {
      timestamp: new Date().toISOString(),
      runId: run.id,
    });

    await this.runs.enqueue(run.id);

    this.logger.log('✅ Run enqueued successfully', {
      timestamp: new Date().toISOString(),
      runId: run.id,
    });

    const runCard: z.infer<typeof RunCard> = { type: 'run', status: 'queued' };
    return { messages: [plan, cfg, runCard] };
  }

  async runAgent(prompt: string) {
    this.logger.log('🤖 Running agent for prompt', {
      timestamp: new Date().toISOString(),
      promptLength: prompt.length,
    });

    const outputs = await runAgent(prompt);

    this.logger.log('✅ Agent execution completed', {
      timestamp: new Date().toISOString(),
      outputsCount: outputs.length,
    });

    return { messages: outputs };
  }
}
