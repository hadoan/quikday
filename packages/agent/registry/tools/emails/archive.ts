import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

export const EmailArchiveIn = z
  .object({ threadId: z.string().optional(), messageId: z.string().optional() })
  .refine((x) => !!x.threadId || !!x.messageId, {
    message: 'Either threadId or messageId is required',
  });
export const EmailArchiveOut = z.object({ ok: z.boolean() });

export type EmailArchiveArgs = z.infer<typeof EmailArchiveIn>;
export type EmailArchiveResult = z.infer<typeof EmailArchiveOut>;

export function emailArchive(moduleRef: ModuleRef): Tool<EmailArchiveArgs, EmailArchiveResult> {
  return {
    name: 'email.archive',
    description:
      'Archive an email thread or message (removes from inbox). Required: threadId or messageId.',
    in: EmailArchiveIn,
    out: EmailArchiveOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args) {
      const parsed = EmailArchiveIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      await svc.archive({ threadId: parsed.threadId, messageId: parsed.messageId });
      return { ok: true } as any;
    },
  };
}
