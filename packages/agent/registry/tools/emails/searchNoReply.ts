import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '@nestjs/common';
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

export function emailSearchNoReply(
  moduleRef: ModuleRef,
): Tool<EmailSearchNoReplyArgs, EmailSearchNoReplyResult> {
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
      const log = new Logger('EmailSearchNoReply');
      const parsed = EmailSearchNoReplyIn.parse(args);
      const svc = await resolveEmailService(moduleRef);

      if (!svc?.search || typeof svc.search !== 'function') {
        throw new Error('Email search not available');
      }

      // Calculate date range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parsed.daysAgo);

      // Search for sent emails in date range
      let searchResult = await svc.search({
        text: 'in:sent',
        newerThan: startDate,
        limit: parsed.maxResults * 2, // Fetch more to account for filtering
      });
      try {
        log.debug(
          JSON.stringify({
            op: 'search.result',
            runId: ctx.runId,
            messages: Array.isArray(searchResult?.messages) ? searchResult.messages.length : 0,
            newerThan: startDate.toISOString(),
            maxResults: parsed.maxResults,
          }),
        );
      } catch {}

      // If nothing found, progressively widen window up to 30 days
      if ((searchResult?.messages?.length ?? 0) === 0 && parsed.daysAgo < 30) {
        const widenCandidates = [Math.min(14, 30), Math.min(21, 30), 30];
        for (const days of widenCandidates) {
          if (days <= parsed.daysAgo) continue;
          const retryStart = new Date();
          retryStart.setDate(retryStart.getDate() - days);
          try {
            log.debug(
              JSON.stringify({
                op: 'search.retry',
                daysAgo: days,
                newerThan: retryStart.toISOString(),
              }),
            );
          } catch {}
          const r = await svc.search({
            text: 'in:sent',
            newerThan: retryStart,
            limit: parsed.maxResults * 2,
          });
          if ((r?.messages?.length ?? 0) > 0) {
            searchResult = r;
            try {
              log.debug(
                JSON.stringify({
                  op: 'search.retry.result',
                  messages: r.messages.length,
                  daysAgo: days,
                }),
              );
            } catch {}
            break;
          } else {
            try {
              log.debug(JSON.stringify({ op: 'search.retry.empty', daysAgo: days }));
            } catch {}
          }
        }
      }

      // Filter threads with no replies from recipients
      // Previous logic considered only single-message threads; that misses cases
      // where the user followed up themselves (multiple messages, still no reply).
      // New logic: a thread is "unreplied" if no message in it is from anyone
      // other than the original author of the first message in the thread.
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
        if (!message.threadId) {
          log.debug(JSON.stringify({ op: 'skip.noThreadId', id: message.id }));
          continue;
        }
        if (seenThreadIds.has(message.threadId)) {
          log.debug(JSON.stringify({ op: 'skip.duplicateThread', threadId: message.threadId }));
          continue;
        }
        seenThreadIds.add(message.threadId);

        // Get full thread to check if there are any incoming replies
        if (svc.getThread && typeof svc.getThread === 'function') {
          try {
            const thread = await svc.getThread(message.threadId);

            // Determine original author as the sender of the earliest message
            const sortedByDate = [...thread].sort((a, b) => {
              const at = a.date ? a.date.getTime() : 0;
              const bt = b.date ? b.date.getTime() : 0;
              return at - bt;
            });
            const originalAuthor = (
              sortedByDate[0]?.from?.address ||
              message.from?.address ||
              ''
            ).toLowerCase();

            // Has any message from someone else? If yes, thread has a reply
            const hasIncomingReply = thread.some((m) => {
              const fromAddr = (m.from?.address || '').toLowerCase();
              return fromAddr.length > 0 && fromAddr !== originalAuthor;
            });
            try {
              log.debug(
                JSON.stringify({
                  op: 'thread.analysis',
                  threadId: message.threadId,
                  size: thread.length,
                  originalAuthor,
                  hasIncomingReply,
                }),
              );
            } catch {}

            if (!hasIncomingReply) {
              const origin = sortedByDate[0] || message;
              unrepliedThreads.push({
                threadId: message.threadId,
                messageId: origin.id,
                subject: origin.subject || message.subject || '(No Subject)',
                snippet:
                  origin.snippet || origin.bodyText?.substring(0, 150) || message.snippet || '',
                recipient: origin.to?.[0]?.address || message.to?.[0]?.address || 'unknown',
                sentAt: (origin.date || message.date || new Date()).toISOString(),
              });

              // Stop if we hit the requested limit
              if (unrepliedThreads.length >= parsed.maxResults) {
                break;
              }
            } else {
              log.debug(
                JSON.stringify({ op: 'thread.skipped.replied', threadId: message.threadId }),
              );
            }
          } catch (error) {
            // Skip threads that error
            try {
              log.warn(
                JSON.stringify({
                  op: 'thread.error',
                  threadId: message.threadId,
                  error: (error as Error)?.message || String(error),
                }),
              );
            } catch {}
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
