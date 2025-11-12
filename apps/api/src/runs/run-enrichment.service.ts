import { Injectable, Logger } from '@nestjs/common';
import { StepsService } from './steps.service.js';

/**
 * RunEnrichmentService centralizes step enrichment and credential detection logic.
 * This is the SINGLE SOURCE OF TRUTH for enriched step data.
 * Follows DRY principle by eliminating duplicate enrichment calls.
 */
@Injectable()
export class RunEnrichmentService {
  private readonly logger = new Logger(RunEnrichmentService.name);

  constructor(private stepsService: StepsService) {}

  /**
   * Fetch enriched steps from database with appId and credentialId.
   * This should be the ONLY place we fetch enriched steps to avoid duplication.
   */
  async getEnrichedSteps(runId: string) {
    this.logger.debug('Fetching enriched steps', { runId });
    const steps = await this.stepsService.getStepsByRunId(runId);
    this.logger.debug('✅ Enriched steps fetched', { runId, count: steps.length });
    return steps;
  }

  /**
   * Check if run has steps with missing credentials
   */
  hasMissingCredentials(steps: any[]): boolean {
    return steps.some(
      (step) => step.appId && (step.credentialId === null || step.credentialId === undefined)
    );
  }

  /**
   * Filter steps to only those needing credentials
   */
  filterStepsNeedingCredentials(steps: any[]) {
    return steps.filter(
      (step) => step.appId && (step.credentialId === null || step.credentialId === undefined)
    );
  }

  /**
   * Check if plan contains only chat.respond steps
   */
  isOnlyChatRespond(plan: any[]): boolean {
    return (
      Array.isArray(plan) && plan.length > 0 && plan.every((step) => step.tool === 'chat.respond')
    );
  }

  /**
   * Map enriched steps to chat item format
   * This standardizes the step format across all chat items
   */
  mapStepsToChatFormat(steps: any[]) {
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
  mapStepsToPlanFormat(enrichedSteps: any[], originalPlan: any[]) {
    return enrichedSteps.map((step) => {
      const originalStep = originalPlan.find(
        (p) => p.id === step.planStepId || p.tool === step.tool
      );

      const baseStep: any = {
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
