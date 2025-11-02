import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { registry } from '@quikday/agent/registry/registry';

/**
 * Service to centralize all step persistence logic.
 * Handles creating steps with proper appId and credentialId lookups based on tool registry.
 */
@Injectable()
export class StepsService {
  private readonly logger = new Logger(StepsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a single step with appId and credentialId lookup.
   * @param data - Step data including runId, tool, action, request, response, etc.
   * @param userId - User ID to lookup credentials for
   * @returns Created step
   */
  async createStep(
    data: {
      runId: string;
      tool: string;
      action: string;
      request?: any;
      response?: any;
      errorCode?: string;
      startedAt?: Date;
      endedAt?: Date;
    },
    userId: number,
  ) {
    const { appId, credentialId } = await this.resolveAppAndCredential(data.tool, userId);

    return this.prisma.step.create({
      data: {
        runId: data.runId,
        tool: data.tool,
        action: data.action,
        appId,
        credentialId,
        request: data.request ?? null,
        response: data.response ?? null,
        errorCode: data.errorCode || null,
        startedAt: data.startedAt || new Date(),
        endedAt: data.endedAt,
      },
    });
  }

  /**
   * Create multiple steps in bulk with appId and credentialId lookups.
   * @param steps - Array of step data
   * @param userId - User ID to lookup credentials for
   * @returns Count of created steps
   */
  async createSteps(
    steps: Array<{
      runId: string;
      tool: string;
      action: string;
      request?: any;
      response?: any;
      errorCode?: string;
      startedAt?: Date;
      endedAt?: Date;
    }>,
    userId: number,
  ) {
    if (steps.length === 0) {
      return { count: 0 };
    }

    // Resolve appId and credentialId for each step
    const enrichedSteps = await Promise.all(
      steps.map(async (step) => {
        const { appId, credentialId } = await this.resolveAppAndCredential(step.tool, userId);

        return {
          runId: step.runId,
          tool: step.tool,
          action: step.action,
          appId,
          credentialId,
          request: step.request ?? null,
          response: step.response ?? null,
          errorCode: step.errorCode || null,
          startedAt: step.startedAt || new Date(),
          endedAt: step.endedAt,
        };
      }),
    );

    return this.prisma.step.createMany({
      data: enrichedSteps,
    });
  }

  /**
   * Resolve appId and credentialId based on tool's apps attribute in registry.
   * @param toolName - Name of the tool
   * @param userId - User ID to lookup credentials for
   * @returns Object containing appId and credentialId (or null if not found)
   */
  private async resolveAppAndCredential(
    toolName: string,
    userId: number,
  ): Promise<{ appId: string | null; credentialId: number | null }> {
    try {
      // Get tool from registry to access apps attribute
      const tool = registry.get(toolName);

      if (!tool || !tool.apps || tool.apps.length === 0) {
        this.logger.debug(
          `Tool "${toolName}" has no apps defined in registry, skipping appId/credentialId lookup`,
        );
        return { appId: null, credentialId: null };
      }

      // Use the first app from the apps array (tools typically have one primary app)
      const appSlug = tool.apps[0];

      // Find the user's credential for this app
      const credential = await this.prisma.credential.findFirst({
        where: {
          userId,
          appId: appSlug,
          invalid: false,
        },
        orderBy: [
          { isUserCurrentProfile: 'desc' }, // Prefer current profile
          { createdAt: 'desc' }, // Otherwise most recent
        ],
      });

      if (!credential) {
        this.logger.debug(
          `No valid credential found for userId=${userId}, appId=${appSlug} (tool: ${toolName})`,
        );
        return { appId: appSlug, credentialId: null };
      }

      this.logger.debug(
        `Resolved tool "${toolName}" -> appId: ${appSlug}, credentialId: ${credential.id}`,
      );

      return {
        appId: appSlug,
        credentialId: credential.id,
      };
    } catch (error) {
      // If tool not found in registry or any other error, log and return nulls
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to resolve appId/credentialId for tool "${toolName}": ${errorMessage}`,
      );
      return { appId: null, credentialId: null };
    }
  }

  /**
   * Create planned steps (used by persistPlan in RunsService).
   * These are steps that haven't been executed yet, just planned by the planner.
   * @param runId - Run ID
   * @param plan - Array of planned steps with tool and args
   * @param userId - User ID to lookup credentials for
   * @returns Count of created steps
   */
  async createPlannedSteps(
    runId: string,
    plan: Array<{ tool: string; args?: any }>,
    userId: number,
  ) {
    if (!Array.isArray(plan) || plan.length === 0) {
      return { count: 0 };
    }

    const now = new Date();
    const steps = plan.map((p) => ({
      runId,
      tool: String(p?.tool || 'unknown'),
      action: `Planned ${String(p?.tool || 'unknown')}`,
      request: p && typeof p === 'object' ? (p as any).args ?? null : null,
      startedAt: now,
    }));

    return this.createSteps(steps, userId);
  }

  /**
   * Create executed steps from execution logs (used by persistResult in RunsService).
   * @param runId - Run ID
   * @param logs - Array of execution log entries
   * @param userId - User ID to lookup credentials for
   */
  async createExecutedSteps(
    runId: string,
    logs: Array<{
      tool?: string;
      action?: string;
      appId?: string;
      credentialId?: number;
      request?: any;
      result?: any;
      errorCode?: string;
      ts?: string | number;
      completedAt?: string | number;
    }>,
    userId: number,
  ) {
    if (!Array.isArray(logs) || logs.length === 0) {
      return;
    }

    // Process logs sequentially to maintain order and handle errors
    for (const entry of logs) {
      try {
        await this.createStep(
          {
            runId,
            tool: entry.tool || 'unknown',
            action: entry.action || '',
            request: entry.request ?? null,
            response: entry.result ?? null,
            errorCode: entry.errorCode || undefined,
            startedAt: new Date(entry.ts || Date.now()),
            endedAt: entry.completedAt ? new Date(entry.completedAt) : undefined,
          },
          userId,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to create step for runId=${runId}, tool=${entry.tool}: ${errorMessage}`,
        );
        // Continue with other steps even if one fails
      }
    }
  }

  /**
   * Get all steps for a run.
   * @param runId - Run ID
   * @returns Array of steps
   */
  async getStepsByRunId(runId: string) {
    return this.prisma.step.findMany({
      where: { runId },
      orderBy: { startedAt: 'asc' },
    });
  }

  /**
   * Count steps for a run.
   * @param runId - Run ID
   * @returns Step count
   */
  async countStepsByRunId(runId: string): Promise<number> {
    return this.prisma.step.count({
      where: { runId },
    });
  }
}
