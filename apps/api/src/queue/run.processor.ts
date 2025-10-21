import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { RunsService } from '../runs/runs.service';
import { CredentialService } from '../credentials/credential.service';
import { AgentService } from '@quikday/agent';
import { TelemetryService } from '../telemetry/telemetry.service';
import { getToolMetadata } from '@quikday/appstore';
import { CredentialMissingError, CredentialInvalidError, ErrorCode } from '@quikday/types';
import { randomUUID } from 'crypto';
import { RedisPubSubService } from '@quikday/libs';

@Processor('runs')
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(
    private runs: RunsService,
    private credentials: CredentialService,
    private telemetry: TelemetryService,
    private redisPubSub: RedisPubSubService,
    private agent: AgentService
  ) {
    super();
  }

  async process(job: Job<{ runId: string }>) {
    this.logger.log('🎬 Job picked up from queue', {
      timestamp: new Date().toISOString(),
      jobId: job.id,
      runId: job.data.runId,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
    });

    this.logger.log('📖 Fetching run details from database', {
      timestamp: new Date().toISOString(),
      runId: job.data.runId,
    });

    const run = await this.runs.get(job.data.runId);

    this.logger.log('🔄 Updating run status to "running"', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      previousStatus: run.status,
    });

    await this.runs.updateStatus(run.id, 'running');

    // Publish status update to Redis
    await this.redisPubSub.publishRunEvent(run.id, {
      type: 'run_status',
      payload: { status: 'running' },
    });

    this.logger.log('▶️ Starting run execution', {
      timestamp: new Date().toISOString(),
      runId: run.id,
      prompt: run.prompt.substring(0, 50) + (run.prompt.length > 50 ? '...' : ''),
      mode: run.mode,
      userId: run.userId,
      teamId: run.teamId,
    });

    try {
      this.logger.log('🏗️ Building execution context', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });

      // Build execution context with credential resolver
      const executionContext = {
        userId: run.userId,
        teamId: run.teamId,
        runId: run.id,
        channelTargets: (run.config as any)?.channelTargets || [],
      };

      this.logger.log('🔧 Execution context built', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        channelTargetsCount: executionContext.channelTargets.length,
      });

      // Create a credential-aware tool executor
      const toolExecutor = async (toolName: string, input: any) => {
        this.logger.log('🔨 Executing tool', {
          timestamp: new Date().toISOString(),
          runId: executionContext.runId,
          toolName,
          inputKeys: Object.keys(input || {}),
        });

        const toolMeta = getToolMetadata(toolName);
        if (!toolMeta) {
          this.logger.error('❌ Unknown tool requested', {
            timestamp: new Date().toISOString(),
            toolName,
          });
          throw new Error(`Unknown tool: ${toolName}`);
        }

        this.logger.debug('📋 Tool metadata retrieved', {
          toolName,
          appId: toolMeta.appId,
          requiresCredential: toolMeta.requiresCredential,
          effectful: toolMeta.effectful,
        });

        const stepStartedAt = new Date();
        let credential: any = null;

        // Resolve credential if required
        if (toolMeta.requiresCredential) {
          this.logger.log('🔐 Resolving credential', {
            timestamp: new Date().toISOString(),
            runId: executionContext.runId,
            appId: toolMeta.appId,
          });

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

            this.logger.log('✅ Credential resolved', {
              timestamp: new Date().toISOString(),
              credentialId: credential.id,
              appId: toolMeta.appId,
            });

            this.logger.log('🔍 Validating credential', {
              timestamp: new Date().toISOString(),
              credentialId: credential.id,
            });

            // Validate credential
            const isValid = await this.credentials.validateCredential(credential.id);
            if (!isValid) {
              this.logger.error('❌ Credential validation failed', {
                timestamp: new Date().toISOString(),
                credentialId: credential.id,
                appId: toolMeta.appId,
              });
              throw new CredentialInvalidError(toolMeta.appId, credential.id);
            }

            this.logger.log('✅ Credential validated', {
              timestamp: new Date().toISOString(),
              credentialId: credential.id,
            });
          } catch (error: any) {
            this.logger.error('❌ Credential resolution/validation failed', {
              timestamp: new Date().toISOString(),
              error: error.message,
              errorCode: error.code || ErrorCode.E_CREDENTIAL_MISSING,
            });

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
          this.logger.log('⚡ Executing tool with credential', {
            timestamp: new Date().toISOString(),
            toolName,
            hasCredential: !!credential,
            userId: executionContext.userId,
          });

          // Execute tool with credential and userId from execution context
          result = await this.executeTool(
            toolName,
            input,
            credential?.key,
            executionContext.userId
          );

          this.logger.log('✅ Tool execution completed successfully', {
            timestamp: new Date().toISOString(),
            toolName,
            hasResult: !!result,
          });

          // Track success
          await this.telemetry.track('step_succeeded', {
            runId: executionContext.runId,
            tool: toolName,
            appId: toolMeta.appId,
          });

          // Record effect if effectful
          if (toolMeta.effectful) {
            this.logger.log('💾 Recording effect', {
              timestamp: new Date().toISOString(),
              toolName,
              appId: toolMeta.appId,
              canUndo: toolMeta.undoStrategy !== 'none',
            });

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

            this.logger.log('✅ Effect recorded', {
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error: any) {
          this.logger.error('❌ Tool execution failed', {
            timestamp: new Date().toISOString(),
            toolName,
            error: error.message,
            status: error.status,
          });

          // Check if vendor returned 401/403 - mark credential invalid
          if (error.status === 401 || error.status === 403) {
            if (credential) {
              this.logger.warn('⚠️ Marking credential as invalid due to auth error', {
                timestamp: new Date().toISOString(),
                credentialId: credential.id,
                status: error.status,
              });

              await this.credentials.markInvalid(credential.id, `Vendor returned ${error.status}`);
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

        const stepResult = {
          tool: toolName,
          action: toolMeta.description,
          appId: toolMeta.appId,
          credentialId: credential?.id,
          request: input,
          result,
          errorCode,
          ts: stepStartedAt.toISOString(),
        };

        this.logger.log('✅ Tool execution step completed', {
          timestamp: new Date().toISOString(),
          toolName,
          duration: Date.now() - stepStartedAt.getTime(),
        });

        return stepResult;
      };

      this.logger.log('🕸️ Building execution graph', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });

      this.logger.log('🚀 Invoking AI agent', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        prompt: run.prompt,
        promptLength: run.prompt.length,
      });

      this.logger.log('📝 Full prompt being sent to OpenAI:', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        fullPrompt: run.prompt,
      });

      // Set tool execution context for AUTO mode
      const appliedToolContext = run.mode === 'auto';
      if (appliedToolContext) {
        this.agent.setToolExecutionContext({
          userId: executionContext.userId,
        });
        this.logger.log('🔑 Tool execution context set', {
          runId: run.id,
          userId: executionContext.userId,
        });
      }

      let result: { messages: any[]; finalOutput: string | null };
      try {
        result = await this.agent.runAgentWithEvents(run.prompt, {
          onPlanGenerated: async (plan) => {
            this.logger.log('📋 Plan generated', { runId: run.id, tools: plan.tools });
            await this.redisPubSub.publishRunEvent(run.id, {
              type: 'plan_generated',
              payload: {
                intent: plan.intent,
                tools: plan.tools,
                actions: plan.tools.map((t) => `Execute ${t}`),
              },
            });
          },
          onToolStarted: async (tool, args) => {
            this.logger.log('🔧 Tool started', { runId: run.id, tool, args });
            await this.redisPubSub.publishRunEvent(run.id, {
              type: 'step_started',
              payload: {
                tool,
                action: `Executing ${tool}`,
                request: args,
              },
            });
          },
          onToolCompleted: async (tool, result) => {
            this.logger.log('✅ Tool completed', {
              runId: run.id,
              tool,
              resultPreview: result.substring(0, 100),
            });
            await this.redisPubSub.publishRunEvent(run.id, {
              type: 'step_succeeded',
              payload: {
                tool,
                action: `Completed ${tool}`,
                response: result,
              },
            });
          },
          onCompleted: async (finalMessage) => {
            this.logger.log('🎉 Agent completed', { runId: run.id, finalMessage });
          },
        });
      } finally {
        if (appliedToolContext) {
          this.agent.setToolExecutionContext(null);
        }
      }

      this.logger.log('✅ Agent execution completed', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        messagesCount: result.messages.length,
        hasFinalOutput: !!result.finalOutput,
      });

      // Extract logs and output from agent result
      const logs: any[] = [];
      const output = result.finalOutput ? { message: result.finalOutput } : null;

      this.logger.log('💾 Persisting execution results', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        logsCount: logs.length,
        hasOutput: !!output,
      });

      this.logger.debug('📋 Extracted logs:', { logs });
      this.logger.debug('📤 Extracted output:', { output });

      await this.runs.persistResult(run.id, { logs, output });

      this.logger.log('🎉 Updating run status to "done"', {
        timestamp: new Date().toISOString(),
        runId: run.id,
      });

      await this.runs.updateStatus(run.id, 'done');

      // Publish completion event to Redis
      await this.redisPubSub.publishRunEvent(run.id, {
        type: 'run_completed',
        payload: { status: 'done', output },
      });

      this.logger.log('✅ Job completed successfully', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        runId: run.id,
        totalDuration: Date.now() - (job.processedOn || Date.now()),
      });
      await this.telemetry.track('run_completed', { runId: run.id, status: 'done' });
    } catch (err: any) {
      this.logger.error('❌ Job execution failed', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        runId: run.id,
        error: err?.message,
        errorCode: err?.code,
      });

      const errorPayload =
        err instanceof CredentialMissingError || err instanceof CredentialInvalidError
          ? err.toJSON()
          : { message: err?.message, code: ErrorCode.E_PLAN_FAILED };

      this.logger.log('💾 Persisting error result', {
        timestamp: new Date().toISOString(),
        runId: run.id,
        errorCode: errorPayload.code,
      });

      await this.runs.persistResult(run.id, { error: errorPayload });
      await this.runs.updateStatus(run.id, 'failed');

      // Publish failure event to Redis
      await this.redisPubSub.publishRunEvent(run.id, {
        type: 'run_status',
        payload: { status: 'failed', error: errorPayload },
      });

      await this.telemetry.track('run_completed', {
        runId: run.id,
        status: 'failed',
        errorCode: errorPayload.code,
      });

      this.logger.error('🔴 Job marked as failed', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        runId: run.id,
      });

      throw err;
    }
  }

  private async executeTool(
    toolName: string,
    input: any,
    credentialKey?: any,
    userId?: number
  ): Promise<any> {
    this.logger.debug('Executing tool', {
      toolName,
      hasCredential: !!credentialKey,
      userId,
    });

    // Import tool handlers dynamically based on toolName
    switch (toolName) {
      case 'create_google_calendar_event': {
        const { createGoogleCalendarEvent } = await import('@quikday/appstore-google-calendar');
        if (!userId) {
          throw new Error('userId is required for Google Calendar tool');
        }
        return await createGoogleCalendarEvent(input, userId);
      }

      case 'send_gmail_email': {
        const { sendGmailEmail } = await import('@quikday/appstore-gmail-email');
        if (!userId) {
          throw new Error('userId is required for Gmail tool');
        }
        // Assuming similar signature - update if needed
        return await sendGmailEmail(input, userId);
      }

      case 'send_slack_dm': {
        // Mock implementation for now
        return `💬 DM to ${input.to}: ${input.message}`;
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
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
