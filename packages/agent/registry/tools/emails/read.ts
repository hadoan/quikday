import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

export const EmailReadIn = z.object({
  query: z.string().optional().describe('Search query (provider-specific syntax)'),
  limit: z.number().int().positive().max(50).default(10),
  from: z.string().optional(),
  to: z.string().optional(),
  // Accept 0 to represent "today/recent" windows (e.g., last N minutes upstream)
  newerThanDays: z.number().int().nonnegative().max(365).optional(),
});

export const EmailReadOut = z.object({
  ok: z.boolean(),
  count: z.number().int().nonnegative(),
  messages: z.array(
    z.object({
      id: z.string(),
      from: z.string().optional(),
      to: z.array(z.string()).optional(),
      subject: z.string().optional(),
      snippet: z.string().optional(),
      date: z.string().optional(),
      threadId: z.string().optional(),
    }),
  ),
});

export type EmailReadArgs = z.infer<typeof EmailReadIn>;
export type EmailReadResult = z.infer<typeof EmailReadOut>;

export function emailRead(moduleRef: ModuleRef): Tool<EmailReadArgs, EmailReadResult> {
  return {
    name: 'email.read',
    description:
      'Search and read emails. Optional: query (search string), maxResults (default 10), newerThanDays, labels.',
    in: EmailReadIn,
    out: EmailReadOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const parsed = EmailReadIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      if (!svc?.search) throw new Error('Email service not available');

      const newerThan = parsed.newerThanDays
        ? new Date(Date.now() - parsed.newerThanDays * 24 * 60 * 60 * 1000)
        : undefined;
      const res = await svc.search({
        text: parsed.query,
        from: parsed.from,
        to: parsed.to,
        newerThan,
        limit: parsed.limit,
      } as any);

      const messages = (res?.messages ?? []).map((m: any) => ({
        id: m.id,
        from: typeof m?.from?.address === 'string' ? m.from.address : undefined,
        to: Array.isArray(m?.to) ? m.to.map((t: any) => t.address).filter(Boolean) : undefined,
        subject: m.subject,
        snippet: m.snippet,
        date: m.date ? new Date(m.date).toISOString() : undefined,
        threadId: m.threadId,
      }));
      return EmailReadOut.parse({ ok: true, count: messages.length, messages });
    },
  };
}
