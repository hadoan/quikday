import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

export const EmailMessageGetIn = z.object({ messageId: z.string() });
export const EmailMessageGetOut = z.object({
  ok: z.boolean(),
  message: z
    .object({
      id: z.string(),
      threadId: z.string().optional(),
      subject: z.string().optional(),
      from: z.string().optional(),
      to: z.array(z.string()).optional(),
      date: z.string().optional(),
      snippet: z.string().optional(),
      bodyHtml: z.string().optional(),
      bodyText: z.string().optional(),
    })
    .optional(),
});

export type EmailMessageGetArgs = z.infer<typeof EmailMessageGetIn>;
export type EmailMessageGetResult = z.infer<typeof EmailMessageGetOut>;

export function emailMessageGet(
  moduleRef: ModuleRef,
): Tool<EmailMessageGetArgs, EmailMessageGetResult> {
  return {
    name: 'email.message.get',
    description: 'Get details of a specific email message by ID. Required: messageId.',
    in: EmailMessageGetIn,
    out: EmailMessageGetOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args) {
      const parsed = EmailMessageGetIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      const m: any = await svc.getMessage(parsed.messageId);
      const out = m
        ? {
            id: m.id,
            threadId: m.threadId,
            subject: m.subject,
            from: m?.from?.address,
            to: Array.isArray(m?.to) ? m.to.map((t: any) => t.address).filter(Boolean) : undefined,
            date: m.date ? new Date(m.date).toISOString() : undefined,
            snippet: m.snippet,
            bodyHtml: m.bodyHtml,
            bodyText: m.bodyText,
          }
        : undefined;
      return EmailMessageGetOut.parse({ ok: true, message: out });
    },
  };
}
