import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RunsService } from '../runs/runs.service';
import { CredentialService } from '../credentials/credential.service';
import { buildSocialGraph } from '../engine/social.graph';
import { TelemetryService } from '../telemetry/telemetry.service';
import { getToolMetadata } from '@quikday/appstore';
import { CredentialMissingError, CredentialInvalidError, ErrorCode } from '@quikday/types';
import { randomUUID } from 'crypto';

@Processor('runs')
export class RunProcessor extends WorkerHost {
  constructor(
    private runs: RunsService,
    private credentials: CredentialService,
    private telemetry: TelemetryService
  ) {
    super();
  }

  async process(job: Job<{ runId: string }>) {
    const run = await this.runs.get(job.data.runId);
    await this.runs.updateStatus(run.id, 'running');

    try {
      // Build execution context with credential resolver
      const executionContext = {
        userId: run.userId,
        teamId: run.teamId,
        runId: run.id,
        channelTargets: (run.config as any)?.channelTargets || [],
      };

      // Create a credential-aware tool executor
      const toolExecutor = async (toolName: string, input: any) => {
        const toolMeta = getToolMetadata(toolName);
        if (!toolMeta) {
          throw new Error(`Unknown tool: ${toolName}`);
        }

        const stepStartedAt = new Date();
        let credential: any = null;

        // Resolve credential if required
        if (toolMeta.requiresCredential) {
          try {
            // Check if explicit credentialId provided for this app
            const channelTarget = executionContext.channelTargets.find(
              (t: any) => t.appId === toolMeta.appId
            );

            credential = await this.credentials.resolveCredential({
              userId: executionContext.userId,
              teamId: executionContext.teamId,
              appId: toolMeta.appId,
              credentialId: channelTarget?.credentialId,
            });

            // Validate credential
            const isValid = await this.credentials.validateCredential(credential.id);
            if (!isValid) {
              throw new CredentialInvalidError(toolMeta.appId, credential.id);
            }
          } catch (error: any) {
            // Track failure
            await this.telemetry.track('step_failed', {
              runId: executionContext.runId,
              tool: toolName,
              appId: toolMeta.appId,
              errorCode: error.code || ErrorCode.E_CREDENTIAL_MISSING,
            });

            throw error;
          }
        }

        // Execute the tool with credential
        let result: any;
        let errorCode: string | undefined;

        try {
          // TODO: Actual tool execution with credential.key
          result = await this.executeTool(toolName, input, credential?.key);

          // Track success
          await this.telemetry.track('step_succeeded', {
            runId: executionContext.runId,
            tool: toolName,
            appId: toolMeta.appId,
          });

          // Record effect if effectful
          if (toolMeta.effectful) {
            await this.recordEffect({
              runId: executionContext.runId,
              appId: toolMeta.appId,
              credentialId: credential?.id,
              action: toolName,
              externalRef: result.id || result.url,
              idempotencyKey: randomUUID(),
              undoStrategy: toolMeta.undoStrategy || 'none',
              canUndo: toolMeta.undoStrategy !== 'none',
              metadata: result,
            });
          }
        } catch (error: any) {
          // Check if vendor returned 401/403 - mark credential invalid
          if (error.status === 401 || error.status === 403) {
            if (credential) {
              await this.credentials.markInvalid(
                credential.id,
                `Vendor returned ${error.status}`
              );
            }
            throw new CredentialInvalidError(toolMeta.appId, credential?.id);
          }

          errorCode = ErrorCode.E_STEP_FAILED;
          await this.telemetry.track('step_failed', {
            runId: executionContext.runId,
            tool: toolName,
            appId: toolMeta.appId,
            errorCode,
          });

          throw error;
        }

        return {
          tool: toolName,
          action: toolMeta.description,
          appId: toolMeta.appId,
          credentialId: credential?.id,
          request: input,
          result,
          errorCode,
          ts: stepStartedAt.toISOString(),
        };
      };

      // Execute the graph with our custom executor
      const graph = buildSocialGraph();
      const state = await graph.invoke({
        prompt: run.prompt,
        logs: [],
        toolExecutor,
      });

      await this.runs.persistResult(run.id, { logs: state.logs, output: state.output });
      await this.runs.updateStatus(run.id, 'done');
      await this.telemetry.track('run_completed', { runId: run.id, status: 'done' });
    } catch (err: any) {
      const errorPayload = err instanceof CredentialMissingError || err instanceof CredentialInvalidError
        ? err.toJSON()
        : { message: err?.message, code: ErrorCode.E_PLAN_FAILED };

      await this.runs.persistResult(run.id, { error: errorPayload });
      await this.runs.updateStatus(run.id, 'failed');
      await this.telemetry.track('run_completed', {
        runId: run.id,
        status: 'failed',
        errorCode: errorPayload.code,
      });
      throw err;
    }
  }

  private async executeTool(toolName: string, input: any, credentialKey?: any): Promise<any> {
    // TODO: Implement actual tool execution
    // This would call the appropriate app integration with the credential
    return {
      success: true,
      id: 'mock-id',
      url: 'https://example.com/mock',
      data: input,
    };
  }

  private async recordEffect(effect: {
    runId: string;
    appId: string;
    credentialId: number;
    action: string;
    externalRef?: string;
    idempotencyKey: string;
    undoStrategy: string;
    canUndo: boolean;
    metadata: any;
  }): Promise<void> {
    // TODO: Record to RunEffect table once Prisma client is regenerated
    await this.telemetry.track('effect_recorded', {
      runId: effect.runId,
      appId: effect.appId,
      action: effect.action,
      canUndo: effect.canUndo,
    });
  }
}
