import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

export const EmailSnoozeIn = z
  .object({
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    until: z.string().datetime().describe('ISO datetime when the email should unsnooze'),
  })
  .refine((x) => !!x.threadId || !!x.messageId, {
    message: 'Either threadId or messageId is required',
  });
export const EmailSnoozeOut = z.object({ ok: z.boolean() });

export type EmailSnoozeArgs = z.infer<typeof EmailSnoozeIn>;
export type EmailSnoozeResult = z.infer<typeof EmailSnoozeOut>;

export function emailSnooze(moduleRef: ModuleRef): Tool<EmailSnoozeArgs, EmailSnoozeResult> {
  return {
    name: 'email.snooze',
    description: 'Snooze an email until a specific time. Required: (threadId or messageId) AND snoozeUntil (ISO timestamp).',
    in: EmailSnoozeIn,
    out: EmailSnoozeOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args) {
      const parsed = EmailSnoozeIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      await svc.snooze?.(
        { threadId: parsed.threadId, messageId: parsed.messageId },
        new Date(parsed.until),
      );
      return { ok: true } as any;
    },
  };
}
