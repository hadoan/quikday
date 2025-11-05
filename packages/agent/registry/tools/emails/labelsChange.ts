import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

export const EmailLabelsChangeIn = z
  .object({
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    add: z.array(z.string()).optional(),
    remove: z.array(z.string()).optional(),
  })
  .refine((x) => !!x.threadId || !!x.messageId, {
    message: 'Either threadId or messageId is required',
  });
export const EmailLabelsChangeOut = z.object({ ok: z.boolean() });

export type EmailLabelsChangeArgs = z.infer<typeof EmailLabelsChangeIn>;
export type EmailLabelsChangeResult = z.infer<typeof EmailLabelsChangeOut>;

export function emailLabelsChange(moduleRef: ModuleRef): Tool<EmailLabelsChangeArgs, EmailLabelsChangeResult> {
  return {
    name: 'email.labels.change',
    description: 'Add or remove labels from an email message. Required: messageId. Optional: addLabelIds, removeLabelIds (arrays).',
    in: EmailLabelsChangeIn,
    out: EmailLabelsChangeOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args) {
      const parsed = EmailLabelsChangeIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      await svc.changeLabels(
        { threadId: parsed.threadId, messageId: parsed.messageId },
        { add: parsed.add, remove: parsed.remove },
      );
      return { ok: true } as any;
    },
  };
}
