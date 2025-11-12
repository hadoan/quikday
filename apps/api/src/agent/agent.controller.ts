import { Body, Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { KindeGuard } from '../auth/kinde.guard.js';
import { PrismaService } from '@quikday/prisma';
import { RunsService } from '../runs/runs.service.js';
import { RunEnrichmentService } from '../runs/run-enrichment.service.js';

type ChatMessageDto = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  ts?: string;
  toolName?: string;
};

@Controller('agent')
@UseGuards(KindeGuard)
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly prisma: PrismaService,
    private readonly runsService: RunsService,
    private readonly enrichmentService: RunEnrichmentService,
  ) {}

  /**
   * Plan-only API: runs extractGoal → planner and returns goal, plan, missing.
   * No WebSocket publishes or persistence side effects.
   */
  @Post('plan')
  async plan(@Body('prompt') prompt: string, @Req() req: any) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      throw new BadRequestException('Provide a prompt');
    }

    const user = req?.user || {};
    const teamId: string | undefined = user?.teamId?.toString?.() || undefined;

    // Resolve user from database and get timezone (prefer email, then sub)
    let tz = 'UTC';
    let dbUser: any = null;
    try {
      const email: string | undefined = (user?.email as string | undefined)?.trim()?.toLowerCase();
      const sub: string | undefined = user?.sub as string | undefined;

      if (email) {
        dbUser = await this.prisma.user.findUnique({ where: { email } });
      }
      if (!dbUser && sub) {
        dbUser = await this.prisma.user.findUnique({ where: { sub } });
      }
      if (dbUser?.timeZone) {
        tz = dbUser.timeZone;
      }
    } catch (e) {
      // Fallback to UTC on any lookup error
      tz = 'UTC';
    }

    // Build messages from prompt to avoid sending undefined
    const messages: ChatMessageDto[] = [
      {
        role: 'user',
        content: prompt,
        ts: new Date().toISOString(),
      },
    ];

    // Compute user display name and email for prompt context
    const displayName: string | undefined =
      (dbUser?.displayName as string | undefined) ||
      (typeof user?.name === 'string' ? user.name : undefined) ||
      (typeof user?.given_name === 'string' || typeof user?.family_name === 'string'
        ? [user?.given_name, user?.family_name].filter(Boolean).join(' ')
        : undefined);
    const email: string | undefined = (dbUser?.email as string | undefined) || user?.email;

    const result = await this.agent.planOnly({
      prompt: prompt,
      messages,
      tz,
      userId: dbUser.id,
      teamId,
      userName: displayName,
      userEmail: email,
    });

    // Save to database using RunsService
    try {
      if (!dbUser) {
        throw new Error('User not found in database');
      }

      const numericUserId = dbUser.id;
      const numericTeamId = teamId ? parseInt(teamId, 10) : undefined;

      // Use RunsService to create the plan run with steps
      const run = await this.runsService.createPlanRun({
        prompt,
        userId: numericUserId,
        teamId: numericTeamId,
        tz,
        goal: result.goal,
        plan: result.plan,
        missing: result.missing,
      });

      // Fetch enriched steps from database (single source of truth)
      const enrichedSteps = await this.enrichmentService.getEnrichedSteps(run.id);

      // Map enriched steps to plan format
      const enrichedPlan = this.enrichmentService.mapStepsToPlanFormat(enrichedSteps, result.plan);

      const response = {
        ...result,
        plan: enrichedPlan, // Return enriched plan with credential info
        runId: run.id,
      };

      console.log('[AgentController.plan] Sending response:', {
        runId: run.id,
        hasGoal: !!response.goal,
        planSteps: response.plan?.length || 0,
        missingCount: response.missing?.length || 0,
        missing: response.missing,
        stepsWithCredentials: enrichedSteps.filter((s) => s.credentialId !== null).length,
        stepsWithoutCredentials: enrichedSteps.filter((s) => s.credentialId === null).length,
      });

      // Return the result with the runId included
      return response;
    } catch (error) {
      console.error('Failed to save run to database:', error);
      // Return the result even if database save fails
      return result;
    }
  }
}
