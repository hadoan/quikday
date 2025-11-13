import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { StepsService } from './steps.service.js';

/**
 * Represents an enriched step from the database.
 * This is the return type from Prisma Step model queries.
 */
interface EnrichedStep {
  id: number;
  runId: string;
  tool: string;
  action: string;
  appId: string | null;
  credentialId: number | null;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  errorCode: string | null;
  planStepId: string | null;
  waitingConfirm: boolean;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Represents a plan step from the run's plan field.
 */
interface PlanStep {
  id?: string;
  tool: string;
  args?: Record<string, unknown>;
  dependsOn?: string[];
}

/**
 * Represents a step formatted for chat items.
 */
interface ChatFormatStep {
  id: string | number;
  tool: string;
  appId: string | null;
  credentialId: number | null;
  action: string;
  status: 'pending';
  inputsPreview?: string;
}

/**
 * Represents a step formatted for plan API responses.
 */
interface PlanFormatStep {
  id?: string | number;
  tool: string;
  args?: Record<string, unknown>;
  dependsOn?: string[];
  appId?: string;
  credentialId?: number | null;
}

/**
 * RunEnrichmentService centralizes step enrichment and credential detection logic.
 * This is the SINGLE SOURCE OF TRUTH for enriched step data.
 * Follows DRY principle by eliminating duplicate enrichment calls.
 */
@Injectable()
export class RunEnrichmentService {
  private readonly logger = new Logger(RunEnrichmentService.name);

  constructor(
    private stepsService: StepsService,
    private prisma: PrismaService
  ) {}

  /**
   * Fetch enriched steps from database with appId and credentialId.
   * Includes fallback credential lookup if credentialId is missing.
   * This should be the ONLY place we fetch enriched steps to avoid duplication.
   *
   * @param runId - The run ID
   * @param userId - User ID for fallback credential lookup. Required for credential enrichment.
   */
  async getEnrichedSteps(runId: string, userId?: number): Promise<EnrichedStep[]> {
    this.logger.debug('Fetching enriched steps', { runId, userId });
    const steps = await this.stepsService.getStepsByRunId(runId);

    // Enrich steps with fallback credential lookup for missing credentialIds
    if (userId) {
      // Fetch all credentials for this user once (avoid N+1 queries)
      let credentialsMap: Record<string, number> = {};
      try {
        const credentials = await this.prisma.credential.findMany({
          where: {
            userId,
            invalid: false,
          },
          orderBy: [
            { isUserCurrentProfile: 'desc' }, // Prefer current profile
            { createdAt: 'desc' }, // Otherwise most recent
          ],
          select: { id: true, appId: true },
        });

        // Build a map: appId -> credentialId (first one per app due to orderBy)
        credentialsMap = {};
        for (const cred of credentials) {
          if (!credentialsMap[cred.appId]) {
            credentialsMap[cred.appId] = cred.id;
          }
        }

        this.logger.debug('Fetched credentials map for user', {
          userId,
          appCount: Object.keys(credentialsMap).length,
        });
      } catch (error) {
        this.logger.warn(`Failed to fetch credentials for user ${userId}:`, error);
      }

      // Enrich steps using the pre-fetched credentials map
      const enrichedSteps = steps.map((step) => {
        // If step already has credentialId, no need to look it up
        if (step.credentialId !== null) {
          return step as EnrichedStep;
        }

        // If no appId, can't look up credential
        if (!step.appId) {
          return step as EnrichedStep;
        }

        // Use credentials map to find credential for this app
        const credentialId = credentialsMap[step.appId];
        if (credentialId) {
          this.logger.debug(`Enriched step ${step.id} with fallback credential`, {
            stepId: step.id,
            appId: step.appId,
            credentialId,
          });
          return {
            ...step,
            credentialId,
          } as EnrichedStep;
        }

        return step as EnrichedStep;
      });

      this.logger.debug('✅ Enriched steps fetched with fallback', {
        runId,
        count: enrichedSteps.length,
        withCredentials: enrichedSteps.filter((s) => s.credentialId !== null).length,
      });
      return enrichedSteps;
    }

    this.logger.debug('✅ Enriched steps fetched', { runId, count: steps.length });
    return steps as EnrichedStep[];
  }

  /**
   * Check if run has steps with missing credentials
   */
  hasMissingCredentials(steps: EnrichedStep[]): boolean {
    return steps.some(
      (step) => step.appId && (step.credentialId === null || step.credentialId === undefined)
    );
  }

  /**
   * Filter steps to only those needing credentials
   */
  filterStepsNeedingCredentials(steps: EnrichedStep[]): EnrichedStep[] {
    return steps.filter(
      (step) => step.appId && (step.credentialId === null || step.credentialId === undefined)
    );
  }

  /**
   * Check if plan contains only chat.respond steps
   */
  isOnlyChatRespond(plan: PlanStep[]): boolean {
    return (
      Array.isArray(plan) && plan.length > 0 && plan.every((step) => step.tool === 'chat.respond')
    );
  }

  /**
   * Map enriched steps to chat item format
   * This standardizes the step format across all chat items
   */
  mapStepsToChatFormat(steps: EnrichedStep[]): ChatFormatStep[] {
    return steps.map((step) => ({
      id: step.planStepId || step.id,
      tool: step.tool,
      appId: step.appId,
      credentialId: step.credentialId,
      action: step.action,
      status: 'pending',
      inputsPreview: step.request ? JSON.stringify(step.request) : undefined,
    }));
  }

  /**
   * Map enriched steps to plan response format (for API responses)
   * Merges database step data with original plan data
   */
  mapStepsToPlanFormat(enrichedSteps: EnrichedStep[], originalPlan: PlanStep[]): PlanFormatStep[] {
    return enrichedSteps.map((step) => {
      const originalStep = originalPlan.find(
        (p) => p.id === step.planStepId || p.tool === step.tool
      );

      const baseStep: PlanFormatStep = {
        ...originalStep,
        id: step.planStepId || step.id,
        tool: step.tool,
        args:
          typeof step.request === 'object' && step.request !== null
            ? step.request
            : originalStep?.args || undefined,
      };

      // Only include appId and credentialId if the tool uses apps
      if (step.appId !== null) {
        baseStep.appId = step.appId;
        baseStep.credentialId = step.credentialId ?? null;
      }

      return baseStep;
    });
  }
}
