import { Injectable, Logger } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { RunEnrichmentService } from './run-enrichment.service.js';

/**
 * ChatItemOrchestratorService coordinates the creation of all chat items for a run.
 * Follows Single Responsibility Principle by focusing only on orchestrating chat items.
 * DRY principle: Eliminates duplicate chat item creation logic in createPlanRun and persistPlan.
 */
@Injectable()
export class ChatItemOrchestratorService {
  private readonly logger = new Logger(ChatItemOrchestratorService.name);

  constructor(
    private chatService: ChatService,
    private enrichmentService: RunEnrichmentService
  ) {}

  /**
   * Create all chat items for a run after plan is saved.
   * This is the SINGLE SOURCE OF TRUTH for chat item creation logic.
   */
  async createChatItemsForRun(params: {
    runId: string;
    userId: number;
    teamId: number | null;
    prompt: string;
    goal: any;
    plan: any[];
    missing: any[];
    no_ws_socket_notify?: boolean;
  }) {
    const { runId, userId, teamId, prompt, goal, plan, missing, no_ws_socket_notify } = params;

    this.logger.debug('Creating chat items for run', { runId });

    // Find or create chat for this run
    const chat = await this.chatService.findOrCreateChat(
      runId,
      userId,
      teamId,
      prompt.substring(0, 100)
    );

    // Fetch enriched steps from database (SINGLE SOURCE OF TRUTH)
    const enrichedSteps = await this.enrichmentService.getEnrichedSteps(runId);

    // Detect if plan contains only chat.respond steps
    const onlyChatRespond = this.enrichmentService.isOnlyChatRespond(plan);

    // Check for missing credentials from enriched steps
    const hasMissingCredentials = this.enrichmentService.hasMissingCredentials(enrichedSteps);

    // Map enriched steps to chat format
    const chatSteps = this.enrichmentService.mapStepsToChatFormat(enrichedSteps);

    // 1. Add plan message if we have steps and it's not only chat.respond
    if (Array.isArray(plan) && plan.length > 0 && !onlyChatRespond) {
      await this.chatService.createPlanChatItem(chat.id, runId, userId, teamId, {
        intent: (goal?.outcome as string) || 'Process request',
        steps: chatSteps,
        no_ws_socket_notify
      });
      this.logger.debug('✅ Plan chat item created', { runId });
    }

    // 2. Add app_credentials message if there are steps with missing credentials
    if (hasMissingCredentials) {
      const credentialsItem = await this.chatService.createAppCredentialsChatItem(
        chat.id,
        runId,
        userId,
        teamId,
        chatSteps,
        no_ws_socket_notify
      );
      if (credentialsItem) {
        this.logger.debug('✅ App credentials chat item created', { runId });
      }
    }

    // 3. Add questions message (always add, even if empty questions)
    if (Array.isArray(missing) && missing.length > 0) {
      await this.chatService.createQuestionsChatItem(chat.id, runId, userId, teamId, {
        questions: missing,
        steps: chatSteps,
        hasMissingCredentials,
        no_ws_socket_notify
      });
      this.logger.debug('✅ Questions chat item created (with questions)', {
        runId,
        questionCount: missing.length,
      });
    } else if (!onlyChatRespond) {
      // No missing inputs and not only chat.respond: render Continue panel
      await this.chatService.createQuestionsChatItem(chat.id, runId, userId, teamId, {
        questions: [],
        steps: chatSteps,
        hasMissingCredentials,
        no_ws_socket_notify
      });
      this.logger.debug('✅ Questions chat item created (Continue panel)', { runId });
    }

    // 4. Add assistant text message if no missing inputs and we have a plan
    if ((!missing || missing.length === 0) && plan && plan.length > 0 && !onlyChatRespond) {
      const goalData = goal as Record<string, unknown> | null;
      const goalText = (goalData?.intent as string) || (goalData?.summary as string) || '';
      if (goalText && goalText.trim().length > 0) {
        await this.chatService.createAssistantTextChatItem(
          chat.id,
          runId,
          userId,
          teamId,
          goalText,
          no_ws_socket_notify
        );
        this.logger.debug('✅ Assistant text chat item created', { runId });
      }
    }

    this.logger.debug('✅ All chat items created', { runId, chatId: chat.id });

    return {
      chat,
      enrichedSteps,
      hasMissingCredentials,
      onlyChatRespond,
    };
  }
}
