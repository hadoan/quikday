import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';
import { PrismaService } from '@quikday/prisma';

// ---------------- email.sendFollowup ----------------
export const EmailSendFollowupIn = z.object({
  threadId: z.string().describe('Thread ID to reply to'),
  subject: z.string().describe('Email subject (should start with Re:)'),
  body: z.string().describe('Email body content'),
  to: z.string().describe('Recipient email address'),
  isHtml: z.boolean().optional().default(false).describe('Whether body is HTML'),
});

export const EmailSendFollowupOut = z.object({
  ok: z.boolean(),
  messageId: z.string().optional(),
  threadId: z.string(),
  sent: z.boolean(),
  canUndo: z.boolean(),
  undoExpiresAt: z.string().optional(),
});

export type EmailSendFollowupArgs = z.infer<typeof EmailSendFollowupIn>;
export type EmailSendFollowupResult = z.infer<typeof EmailSendFollowupOut>;

export function emailSendFollowup(moduleRef: ModuleRef): Tool<EmailSendFollowupArgs, EmailSendFollowupResult> {
  return {
    name: 'email.sendFollowup',
    description:
      'Send a follow-up email in an existing thread. This action can be undone within 60 minutes.',
    in: EmailSendFollowupIn,
    out: EmailSendFollowupOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '30/m',
    risk: 'high', // Sending email is a high-risk operation
    async call(args, ctx: RunCtx) {
      const parsed = EmailSendFollowupIn.parse(args);
      const svc = await resolveEmailService(moduleRef);

      if (!svc?.send || typeof svc.send !== 'function') {
        throw new Error('Email send not available');
      }

      // Resolve proper reply headers for Gmail: use the original message's Internet Message-ID
      let replyToMessageId: string | undefined;
      try {
        if (svc?.getThread && typeof svc.getThread === 'function') {
          const thread = await svc.getThread(parsed.threadId);
          if (Array.isArray(thread) && thread.length > 0) {
            const last = thread[thread.length - 1];
            const msgIdRaw = last?.headers?.['Message-ID'] || last?.headers?.['Message-Id'] || last?.headers?.['MessageId'];
            if (typeof msgIdRaw === 'string' && msgIdRaw.trim().length > 0) {
              // Normalize by stripping any surrounding angle brackets
              replyToMessageId = msgIdRaw.trim().replace(/^<|>$/g, '');
            }
          }
        }
      } catch {
        // Non-fatal; will still attempt to set threadId on send
      }

      // Send the email as a reply in the thread
      const draft = {
        subject: parsed.subject,
        to: [{ address: parsed.to }],
        html: parsed.isHtml ? parsed.body : undefined,
        text: !parsed.isHtml ? parsed.body : undefined,
        replyToMessageId,
      };

      const sendResult = await svc.send(draft, { threadId: parsed.threadId });

      // Store for undo capability (60 minutes)
      const prisma = moduleRef.get(PrismaService, { strict: false });
      const undoExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min

      if (prisma && sendResult.messageId) {
        try {
          await prisma.emailAction.create({
            data: {
              userId: String(ctx.userId),
              runId: ctx.runId,
              messageId: sendResult.messageId,
              threadId: parsed.threadId,
              action: 'SENT',
              canUndo: true,
              undoExpiresAt,
            },
          });
        } catch (error) {
          // Log error but don't fail the send
          console.error('Failed to store email action for undo:', error);
        }
      }

      return EmailSendFollowupOut.parse({
        ok: true,
        messageId: sendResult.messageId,
        threadId: parsed.threadId,
        sent: true,
        canUndo: true,
        undoExpiresAt: undoExpiresAt.toISOString(),
      });
    },
    // Undo implementation - delete/recall the sent email
    async undo(result, ctx: RunCtx) {
      if (!result.messageId) return;

      const prisma = moduleRef.get(PrismaService, { strict: false });
      if (!prisma) return;

      // Check if still within undo window
      const action = await prisma.emailAction.findFirst({
        where: {
          messageId: result.messageId,
          userId: String(ctx.userId),
          canUndo: true,
          undoExpiresAt: { gt: new Date() },
        },
      });

      if (!action) {
        throw new Error('Cannot undo: message not found or undo window expired');
      }

      // Try to delete/trash the message via email service
      const svc = await resolveEmailService(moduleRef);
      if (svc && 'deleteMessage' in svc && typeof (svc as any).deleteMessage === 'function') {
        await (svc as any).deleteMessage(result.messageId);
      }

      // Mark as undone
      await prisma.emailAction.update({
        where: { id: action.id },
        data: {
          canUndo: false,
          undoneAt: new Date(),
        },
      });
    },
  };
}
