import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import type { RunEventBus } from '@quikday/libs/pubsub/event-bus';
import { CHANNEL_WEBSOCKET } from '@quikday/libs';

/**
 * ChatService handles all chat and chat item CRUD operations.
 * Follows Single Responsibility Principle by focusing only on chat persistence.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('RunEventBus') private eventBus: RunEventBus,
  ) {}

  private async notifyChatUpdated(runId: string, chatItemId: string, meta?: Record<string, unknown>) {
    try {
      await this.eventBus.publish(
        runId,
        {
          type: 'chat_updated',
          payload: {
            runId,
            chatItemId,
            ...(meta ?? {}),
          },
        },
        CHANNEL_WEBSOCKET,
      );
    } catch (error) {
      this.logger.error('Failed to publish chat_updated event', {
        runId,
        chatItemId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Find existing chat or create new one for a run
   */
  async findOrCreateChat(runId: string, userId: number, teamId: number | null, title: string) {
    let chat = await this.prisma.chat.findUnique({ where: { runId } });
    if (!chat) {
      chat = await this.prisma.chat.create({
        data: { runId, userId, teamId, title },
      });
      this.logger.debug('✅ Chat created', { runId, chatId: chat.id });
    } else {
      this.logger.debug('✅ Chat found', { runId, chatId: chat.id });
    }
    return chat;
  }

  /**
   * Create plan chat item with steps
   */
  async createPlanChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    data: {
      intent: string;
      steps: any[];
    }
  ) {
    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'plan',
        role: 'assistant',
        content: {
          intent: data.intent,
          tools: [],
          actions: [],
          mode: 'plan',
          steps: data.steps,
        } as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, { type: 'plan' });
    return chatItem;
  }

  /**
   * Create app_credentials chat item for steps needing credentials
   * Returns null if no steps need credentials
   */
  async createAppCredentialsChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    steps: any[]
  ) {
    const stepsNeedingCredentials = steps.filter(
      (s) => s.appId && (s.credentialId === null || s.credentialId === undefined)
    );

    if (stepsNeedingCredentials.length === 0) {
      return null;
    }

    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'app_credentials',
        role: 'assistant',
        content: {
          runId,
          steps: stepsNeedingCredentials.map((step) => ({
            id: step.planStepId || step.id,
            tool: step.tool,
            appId: step.appId,
            credentialId: step.credentialId,
            action: step.action,
          })),
        } as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, { type: 'app_credentials' });
    return chatItem;
  }

  /**
   * Create questions chat item
   */
  async createQuestionsChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    data: {
      questions: any[];
      steps: any[];
      hasMissingCredentials?: boolean;
    }
  ) {
    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'questions',
        role: 'assistant',
        content: {
          runId,
          questions: data.questions,
          steps: data.steps,
          hasMissingCredentials: data.hasMissingCredentials || false,
        } as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, { type: 'questions' });
    return chatItem;
  }

  /**
   * Create assistant text chat item
   */
  async createAssistantTextChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    text: string
  ) {
    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'assistant',
        role: 'assistant',
        content: { text } as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, { type: 'assistant' });
    return chatItem;
  }

  /**
   * Create log chat item
   */
  async createLogChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    entries: any[]
  ) {
    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'log',
        role: 'assistant',
        content: { entries } as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, { type: 'log' });
    return chatItem;
  }

  /**
   * Create output chat item
   */
  async createOutputChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    output: any
  ) {
    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'output',
        role: 'assistant',
        content: output as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, { type: 'output' });
    return chatItem;
  }

  /**
   * Create error chat item
   */
  async createErrorChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    error: any
  ) {
    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'error',
        role: 'assistant',
        content: error as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, { type: 'error' });
    return chatItem;
  }

  /**
   * Create status chat item for CHANNEL_WEBSOCKET events
   */
  async createStatusChatItem(
    chatId: string,
    runId: string,
    userId: number,
    teamId: number | null,
    eventType: string,
    payload: any
  ) {
    const chatItem = await this.prisma.chatItem.create({
      data: {
        chatId,
        type: 'status',
        role: 'system',
        content: {
          eventType,
          payload,
        } as any,
        runId,
        userId,
        teamId,
      },
    });
    await this.notifyChatUpdated(runId, chatItem.id, {
      type: 'status',
      eventType,
    });
    return chatItem;
  }
}
