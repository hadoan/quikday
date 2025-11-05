import { Body, Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { KindeGuard } from '../auth/kinde.guard.js';

type ChatMessageDto = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  ts?: string;
  toolName?: string;
};

export interface PlanRequestDto {
  prompt?: string;
  messages?: ChatMessageDto[];
  answers?: Record<string, unknown>;
  tz?: string;
}

@Controller('agent')
@UseGuards(KindeGuard)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /**
   * Plan-only API: runs extractGoal → planner and returns goal, plan, missing.
   * No WebSocket publishes or persistence side effects.
   */
  @Post('plan')
  async plan(@Body() body: PlanRequestDto, @Req() req: any) {
    const { prompt, messages, answers, tz } = body || {};
    if (!prompt && (!messages || messages.length === 0)) {
      throw new BadRequestException('Provide either prompt or messages');
    }

    const user = req?.user || {};
    const userId: string = user?.id || user?.sub || user?.email || 'anonymous';
    const teamId: string | undefined = user?.teamId?.toString?.() || undefined;

    const result = await this.agent.planOnly({
      prompt: prompt || '',
      messages,
      answers,
      tz: tz || 'UTC',
      userId,
      teamId,
    });

    return result;
  }
}

