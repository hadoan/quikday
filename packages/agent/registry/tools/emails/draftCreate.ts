import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { getEmailUtils, resolveEmailService } from './utils.js';

export const EmailDraftCreateIn = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  isHtml: z.boolean().optional().default(false),
  replyToMessageId: z.string().optional(),
});
export const EmailDraftCreateOut = z.object({
  ok: z.boolean(),
  draftId: z.string(),
  // The Gmail draft message id (used for deep-link in Gmail compose URLs)
  messageId: z.string().optional(),
  threadId: z.string().optional(),
});

export type EmailDraftCreateArgs = z.infer<typeof EmailDraftCreateIn>;
export type EmailDraftCreateResult = z.infer<typeof EmailDraftCreateOut>;

export function emailDraftCreate(
  moduleRef: ModuleRef,
): Tool<EmailDraftCreateArgs, EmailDraftCreateResult> {
  return {
    name: 'email.draft.create',
    description:
      'Create an email draft (not sent). Required: to, subject, body. Optional: cc, bcc, html, replyToMessageId (for replies).',
    in: EmailDraftCreateIn,
    out: EmailDraftCreateOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args) {
      const parsed = EmailDraftCreateIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      const { parseEmailAddresses, formatEmailBody } = await getEmailUtils();
      const to = parseEmailAddresses(parsed.to).map((a) => ({ address: a }));
      const cc = parseEmailAddresses(parsed.cc).map((a) => ({ address: a }));
      const bcc = parseEmailAddresses(parsed.bcc).map((a) => ({ address: a }));
      const draft = {
        subject: parsed.subject,
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        html: parsed.isHtml ? formatEmailBody(parsed.body) : undefined,
        text: !parsed.isHtml ? parsed.body : undefined,
        replyToMessageId: parsed.replyToMessageId,
      } as any;
      const res = await svc.createDraft(draft);
      return EmailDraftCreateOut.parse({
        ok: true,
        draftId: res.draftId,
        messageId: (res as any).messageId,
        threadId: res.threadId,
      });
    },
  };
}
