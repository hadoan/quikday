import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getEmailUtils, resolveEmailService } from './utils.js';

// ---------------- email.send ----------------
// Re-declare schema locally to avoid cross-package Zod instance issues
export const EmailSendIn = z.object({
  to: z.string().describe('Recipient email address or comma-separated list of addresses'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body content (plain text or HTML)'),
  cc: z.string().optional().describe('CC recipients (comma-separated email addresses)'),
  bcc: z.string().optional().describe('BCC recipients (comma-separated email addresses)'),
  attachments: z.string().optional().describe('Comma-separated file paths or URLs to attach'),
  isHtml: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether the body is HTML (default: false for plain text)'),
  replyTo: z.string().optional().describe('Reply-to email address'),
  provider: z.string().optional().describe('Optional provider hint, e.g., gmail'),
});

export const EmailSendOut = z.object({
  ok: z.boolean(),
  to: z.array(z.string()),
  subject: z.string(),
  messageId: z.string().optional(),
  preview: z.string().optional(),
  provider: z.string().optional(),
});

export type EmailSendArgs = z.infer<typeof EmailSendIn>;
export type EmailSendResult = z.infer<typeof EmailSendOut>;

export function emailSend(moduleRef: ModuleRef): Tool<EmailSendArgs, EmailSendResult> {
  return {
    name: 'email.send',
    description:
      'Send an email message. Required: to (comma-separated), subject, body. Optional: cc, bcc, html (boolean).',
    in: EmailSendIn,
    out: EmailSendOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const parsed = EmailSendIn.parse(args);
      const { parseEmailAddresses, validateEmailAddresses, formatEmailBody } = await getEmailUtils();
      const to = parseEmailAddresses(parsed.to);
      const cc = parseEmailAddresses(parsed.cc);
      const bcc = parseEmailAddresses(parsed.bcc);

      const { invalid } = validateEmailAddresses([...to, ...cc, ...bcc]);
      if (invalid.length > 0) {
        throw new Error(`Invalid email addresses: ${invalid.join(', ')}`);
      }
      if (to.length === 0) {
        throw new Error('No valid recipients');
      }

      // Try injected Gmail provider service first (registered via GmailEmailModule)
      const svc = await resolveEmailService(moduleRef);
      if (svc?.send && typeof svc.send === 'function') {
        // Map tool input into EmailService DraftInput
        const toAddrs = to.map((a) => ({ address: a }));
        const ccAddrs = cc.map((a) => ({ address: a }));
        const bccAddrs = bcc.map((a) => ({ address: a }));
        const draft = {
          subject: parsed.subject,
          to: toAddrs,
          cc: ccAddrs.length ? ccAddrs : undefined,
          bcc: bccAddrs.length ? bccAddrs : undefined,
          html: parsed.isHtml ? formatEmailBody(parsed.body) : undefined,
          text: !parsed.isHtml ? parsed.body : undefined,
        } as any;

        const res = await svc.send(draft);
        return EmailSendOut.parse({
          ok: true,
          to,
          subject: parsed.subject,
          messageId: res?.messageId,
          preview: formatEmailBody(parsed.body).slice(0, 160),
          provider: parsed.provider,
        });
      }

      // TODO: dynamic import provider connector based on ctx or args.provider
      // For now, return a dev-friendly stub result
      return EmailSendOut.parse({
        ok: true,
        to,
        subject: parsed.subject,
        messageId: `msg_${Math.random().toString(36).slice(2, 10)}`,
        preview: formatEmailBody(parsed.body).slice(0, 160),
        provider: parsed.provider ?? 'stub',
      });
    },
  };
}
