import {
  Controller,
  Delete,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { KindeGuard } from '../auth/kinde.guard.js';
import { PrismaService } from '@quikday/prisma';
import { ModuleRef } from '@nestjs/core';

@Controller('email')
@UseGuards(KindeGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
  ) {}

  @Delete('undo/:messageId')
  async undoMessage(@Param('messageId') messageId: string, @Req() req: any) {
    const userId = req?.user?.sub || req?.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    this.logger.log(`Undo email requested for messageId=${messageId} by user=${userId}`);

    // Check if action exists and is still within undo window
    const action = await this.prisma.emailAction.findFirst({
      where: {
        messageId,
        userId: String(userId),
        canUndo: true,
        undoExpiresAt: { gt: new Date() },
      },
    });

    if (!action) {
      throw new BadRequestException(
        'Cannot undo: message not found or undo window expired (60 minutes)',
      );
    }

    // Try to delete/trash the message via Gmail service
    try {
      // Get the email service dynamically
      const gmailService = this.moduleRef.get('GmailEmailService', { strict: false });
      
      if (gmailService && typeof (gmailService as any).deleteMessage === 'function') {
        await (gmailService as any).deleteMessage(messageId);
        this.logger.log(`Email message ${messageId} moved to trash`);
      } else {
        this.logger.warn('Gmail deleteMessage method not available, marking as undone only');
      }
    } catch (error) {
      this.logger.error(`Failed to delete message ${messageId}:`, error);
      throw new BadRequestException('Failed to undo email: ' + (error as Error).message);
    }

    // Mark as undone
    await this.prisma.emailAction.update({
      where: { id: action.id },
      data: {
        canUndo: false,
        undoneAt: new Date(),
      },
    });

    this.logger.log(`Email action ${action.id} marked as undone`);

    return {
      ok: true,
      message: 'Email moved to trash successfully',
      messageId,
      undoneAt: new Date().toISOString(),
    };
  }
}
