import { z } from 'zod';
import type { Tool } from '../types';
import type { RunCtx } from '../../state/types';
import { parseEmailAddresses, validateEmailAddresses, formatEmailBody, textToHtml, generateEmailSummary } from '@quikday/appstore';
import { ModuleRef } from '@nestjs/core';
import type { EmailService } from '@quikday/appstore/email/email.service';
// ---------------- email.send ----------------
// Re-declare schema locally to avoid cross-package Zod instance issues
const EmailSendIn = z.object({
    to: z.string().describe('Recipient email address or comma-separated list of addresses'),
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Email body content (plain text or HTML)'),
    cc: z.string().optional().describe('CC recipients (comma-separated email addresses)'),
    bcc: z.string().optional().describe('BCC recipients (comma-separated email addresses)'),
    attachments: z.string().optional().describe('Comma-separated file paths or URLs to attach'),
    isHtml: z.boolean().optional().default(false).describe('Whether the body is HTML (default: false for plain text)'),
    replyTo: z.string().optional().describe('Reply-to email address'),
    provider: z.string().optional().describe('Optional provider hint, e.g., gmail'),
});

const EmailSendOut = z.object({
    ok: z.boolean(),
    to: z.array(z.string()),
    subject: z.string(),
    messageId: z.string().optional(),
    preview: z.string().optional(),
    provider: z.string().optional(),
});

export function emailSend(moduleRef: ModuleRef): Tool<z.infer<typeof EmailSendIn>, z.infer<typeof EmailSendOut>> {
    return {
        name: 'email.send',
        in: EmailSendIn,
        out: EmailSendOut,
        scopes: [],
        rate: '60/m',
        risk: 'low',
        async call(args, ctx: RunCtx) {
            const parsed = EmailSendIn.parse(args);
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

            // Try injected service first
            const svc = moduleRef.get('GmailEmailService', { strict: false }) as EmailService;
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
                    // If we ever parse a real message id, pass via replyToMessageId
                    // For now, if replyTo is an address, Gmail will treat it as header only; not threading
                    // We'll omit mapping here as DraftInput expects a message id
                } as any; // keep flexible until types are unified

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
// ---------------- email.read ----------------

const EmailReadIn = z.object({
    query: z.string().optional().describe('Search query (provider-specific syntax)'),
    limit: z.number().int().positive().max(50).default(10),
    from: z.string().optional(),
    to: z.string().optional(),
    newerThanDays: z.number().int().positive().max(365).optional(),
});

const EmailReadOut = z.object({
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

export const emailRead: Tool<z.infer<typeof EmailReadIn>, z.infer<typeof EmailReadOut>> = {
    name: 'email.read',
    in: EmailReadIn,
    out: EmailReadOut,
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
        const parsed = EmailReadIn.parse(args);

        // Try injected service first
        const svc = (ctx as any)?.services?.email;
        if (svc?.search && typeof svc.search === 'function') {
            const res = await svc.search(parsed);
            // Expect shape: { ok, messages: [] }
            return EmailReadOut.parse({
                ok: Boolean(res?.ok ?? true),
                count: Array.isArray(res?.messages) ? res.messages.length : 0,
                messages: Array.isArray(res?.messages) ? res.messages : [],
            });
        }

        // Dev-friendly stub: return an empty list
        return EmailReadOut.parse({ ok: true, count: 0, messages: [] });
    },
};

// Utility for planner: stable summary generation if needed by downstream
export function buildEmailSummary(to: string[], subject: string, body: string): string {
    const preview = formatEmailBody(body).slice(0, 100);
    return generateEmailSummary(to[0], subject, preview);
}
