import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

// ---------------- email.searchNoReply ----------------
export const EmailSearchNoReplyIn = z.object({
  daysAgo: z.number().min(1).max(30).describe('Number of days to look back for unreplied emails'),
  maxResults: z
    .number()
    .max(50)
    .default(20)
    .describe('Maximum number of unreplied threads to return'),
});

export const EmailSearchNoReplyOut = z.object({
  threads: z.array(
    z.object({
      threadId: z.string(),
      messageId: z.string(),
      subject: z.string(),
      snippet: z.string(),
      recipient: z.string(),
      sentAt: z.string(),
    }),
  ),
  count: z.number(),
  searchedDays: z.number(),
});

export type EmailSearchNoReplyArgs = z.infer<typeof EmailSearchNoReplyIn>;
export type EmailSearchNoReplyResult = z.infer<typeof EmailSearchNoReplyOut>;

export function emailSearchNoReply(moduleRef: ModuleRef): Tool<EmailSearchNoReplyArgs, EmailSearchNoReplyResult> {
  return {
    name: 'email.searchNoReply',
    description:
      'Search for email threads you sent in the last N days that have not received a reply. Returns thread metadata including subject, recipient, and preview.',
    in: EmailSearchNoReplyIn,
    out: EmailSearchNoReplyOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const parsed = EmailSearchNoReplyIn.parse(args);
      const svc = await resolveEmailService(moduleRef);

      if (!svc?.search || typeof svc.search !== 'function') {
        throw new Error('Email search not available');
      }

      // Calculate date range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parsed.daysAgo);

      // Search for sent emails in date range
      const searchResult = await svc.search({
        text: 'in:sent',
        newerThan: startDate,
        limit: parsed.maxResults * 2, // Fetch more to account for filtering
      });

      // Filter threads with no replies
      const unrepliedThreads: Array<{
        threadId: string;
        messageId: string;
        subject: string;
        snippet: string;
        recipient: string;
        sentAt: string;
      }> = [];

      const seenThreadIds = new Set<string>();

      for (const message of searchResult.messages) {
        if (!message.threadId || seenThreadIds.has(message.threadId)) continue;
        seenThreadIds.add(message.threadId);

        // Get full thread to check reply count
        if (svc.getThread && typeof svc.getThread === 'function') {
          try {
            const thread = await svc.getThread(message.threadId);

            // If thread only has 1 message (the original), it's unreplied
            if (thread.length === 1) {
              unrepliedThreads.push({
                threadId: message.threadId,
                messageId: message.id,
                subject: message.subject || '(No Subject)',
                snippet: message.snippet || message.bodyText?.substring(0, 150) || '',
                recipient: message.to?.[0]?.address || 'unknown',
                sentAt: message.date?.toISOString() || new Date().toISOString(),
              });

              // Stop if we hit the requested limit
              if (unrepliedThreads.length >= parsed.maxResults) {
                break;
              }
            }
          } catch (error) {
            // Skip threads that error
            continue;
          }
        }
      }

      return EmailSearchNoReplyOut.parse({
        threads: unrepliedThreads,
        count: unrepliedThreads.length,
        searchedDays: parsed.daysAgo,
      });
    },
  };
}
