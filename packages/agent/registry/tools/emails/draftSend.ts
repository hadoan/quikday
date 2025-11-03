import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

export const EmailDraftSendIn = z.object({ draftId: z.string() });
export const EmailDraftSendOut = z.object({
  ok: z.boolean(),
  messageId: z.string(),
  threadId: z.string(),
});

export type EmailDraftSendArgs = z.infer<typeof EmailDraftSendIn>;
export type EmailDraftSendResult = z.infer<typeof EmailDraftSendOut>;

export function emailDraftSend(moduleRef: ModuleRef): Tool<EmailDraftSendArgs, EmailDraftSendResult> {
  return {
    name: 'email.draft.send',
    description: 'Send an existing email draft. Required: draftId.',
    in: EmailDraftSendIn,
    out: EmailDraftSendOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args) {
      const parsed = EmailDraftSendIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      const res = await svc.sendExistingDraft(parsed.draftId);
      return EmailDraftSendOut.parse({
        ok: true,
        messageId: res.messageId,
        threadId: res.threadId,
      });
    },
  };
}
