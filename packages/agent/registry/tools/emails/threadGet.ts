import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

export const EmailThreadGetIn = z.object({ threadId: z.string() });
export const EmailThreadGetOut = z.object({
  ok: z.boolean(),
  messages: z.array(
    z.object({
      id: z.string(),
      subject: z.string().optional(),
      from: z.string().optional(),
      to: z.array(z.string()).optional(),
      date: z.string().optional(),
      snippet: z.string().optional(),
    }),
  ),
});

export type EmailThreadGetArgs = z.infer<typeof EmailThreadGetIn>;
export type EmailThreadGetResult = z.infer<typeof EmailThreadGetOut>;

export function emailThreadGet(moduleRef: ModuleRef): Tool<EmailThreadGetArgs, EmailThreadGetResult> {
  return {
    name: 'email.thread.get',
    description: 'Get all messages in an email thread. Required: threadId.',
    in: EmailThreadGetIn,
    out: EmailThreadGetOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args) {
      const parsed = EmailThreadGetIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      const msgs: any[] = await svc.getThread(parsed.threadId);
      const messages = msgs.map((m) => ({
        id: m.id,
        subject: m.subject,
        from: m?.from?.address,
        to: Array.isArray(m?.to) ? m.to.map((t: any) => t.address).filter(Boolean) : undefined,
        date: m.date ? new Date(m.date).toISOString() : undefined,
        snippet: m.snippet,
      }));
      return EmailThreadGetOut.parse({ ok: true, messages });
    },
  };
}
