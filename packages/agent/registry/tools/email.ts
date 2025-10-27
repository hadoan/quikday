import { z } from 'zod';
import type { Tool } from '../types';
import type { RunCtx } from '../../state/types';
import { ModuleRef } from '@nestjs/core';
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

async function getEmailUtils() {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
    const parseEmailAddresses = (input?: string): string[] =>
        typeof input === 'string'
            ? input
                  .split(',')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
            : [];
    const validateEmailAddresses = (addrs: string[]) => {
        const valid: string[] = [];
        const invalid: string[] = [];
        for (const a of addrs) (EMAIL_REGEX.test(a) ? valid : invalid).push(a);
        return { valid, invalid };
    };
    const formatEmailBody = (s: string) => s;
    const generateEmailSummary = (to: string, subject: string, preview: string) => `${to}: ${subject} — ${preview}`;
    return { parseEmailAddresses, validateEmailAddresses, formatEmailBody, generateEmailSummary };
}

async function resolveEmailService(moduleRef: ModuleRef): Promise<any> {
    const m = await import('@quikday/appstore-gmail-email');
    const GmailEmailService = (m as any).GmailEmailService;
    return moduleRef.get(GmailEmailService as any, { strict: false }) as any;
}

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

export function emailRead(moduleRef: ModuleRef): Tool<z.infer<typeof EmailReadIn>, z.infer<typeof EmailReadOut>> {
    return {
        name: 'email.read',
        in: EmailReadIn,
        out: EmailReadOut,
        scopes: [],
        rate: '120/m',
        risk: 'low',
        async call(args, _ctx: RunCtx) {
            const parsed = EmailReadIn.parse(args);
            const svc = await resolveEmailService(moduleRef);
            if (!svc?.search) throw new Error('Email service not available');

            const newerThan = parsed.newerThanDays ? new Date(Date.now() - parsed.newerThanDays * 24 * 60 * 60 * 1000) : undefined;
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

// ---------------- email.message.get ----------------
const EmailMessageGetIn = z.object({ messageId: z.string() });
const EmailMessageGetOut = z.object({
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

export function emailMessageGet(moduleRef: ModuleRef): Tool<z.infer<typeof EmailMessageGetIn>, z.infer<typeof EmailMessageGetOut>> {
    return {
        name: 'email.message.get',
        in: EmailMessageGetIn,
        out: EmailMessageGetOut,
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

// ---------------- email.thread.get ----------------
const EmailThreadGetIn = z.object({ threadId: z.string() });
const EmailThreadGetOut = z.object({
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

export function emailThreadGet(moduleRef: ModuleRef): Tool<z.infer<typeof EmailThreadGetIn>, z.infer<typeof EmailThreadGetOut>> {
    return {
        name: 'email.thread.get',
        in: EmailThreadGetIn,
        out: EmailThreadGetOut,
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

// ---------------- email.draft.create ----------------
const EmailDraftCreateIn = z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    isHtml: z.boolean().optional().default(false),
});
const EmailDraftCreateOut = z.object({ ok: z.boolean(), draftId: z.string(), threadId: z.string().optional() });

export function emailDraftCreate(moduleRef: ModuleRef): Tool<z.infer<typeof EmailDraftCreateIn>, z.infer<typeof EmailDraftCreateOut>> {
    return {
        name: 'email.draft.create',
        in: EmailDraftCreateIn,
        out: EmailDraftCreateOut,
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
            } as any;
            const res = await svc.createDraft(draft);
            return EmailDraftCreateOut.parse({ ok: true, draftId: res.draftId, threadId: res.threadId });
        },
    };
}

// ---------------- email.draft.send ----------------
const EmailDraftSendIn = z.object({ draftId: z.string() });
const EmailDraftSendOut = z.object({ ok: z.boolean(), messageId: z.string(), threadId: z.string() });

export function emailDraftSend(moduleRef: ModuleRef): Tool<z.infer<typeof EmailDraftSendIn>, z.infer<typeof EmailDraftSendOut>> {
    return {
        name: 'email.draft.send',
        in: EmailDraftSendIn,
        out: EmailDraftSendOut,
        scopes: [],
        rate: '60/m',
        risk: 'low',
        async call(args) {
            const parsed = EmailDraftSendIn.parse(args);
            const svc = await resolveEmailService(moduleRef);
            const res = await svc.sendExistingDraft(parsed.draftId);
            return EmailDraftSendOut.parse({ ok: true, messageId: res.messageId, threadId: res.threadId });
        },
    };
}

// ---------------- email.labels.change ----------------
const EmailLabelsChangeIn = z.object({
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    add: z.array(z.string()).optional(),
    remove: z.array(z.string()).optional(),
}).refine((x) => !!x.threadId || !!x.messageId, { message: 'Either threadId or messageId is required' });
const EmailLabelsChangeOut = z.object({ ok: z.boolean() });

export function emailLabelsChange(moduleRef: ModuleRef): Tool<z.infer<typeof EmailLabelsChangeIn>, z.infer<typeof EmailLabelsChangeOut>> {
    return {
        name: 'email.labels.change',
        in: EmailLabelsChangeIn,
        out: EmailLabelsChangeOut,
        scopes: [],
        rate: '120/m',
        risk: 'low',
        async call(args) {
            const parsed = EmailLabelsChangeIn.parse(args);
            const svc = await resolveEmailService(moduleRef);
            await svc.changeLabels({ threadId: parsed.threadId, messageId: parsed.messageId }, { add: parsed.add, remove: parsed.remove });
            return { ok: true } as any;
        },
    };
}

// ---------------- email.archive ----------------
const EmailArchiveIn = z.object({ threadId: z.string().optional(), messageId: z.string().optional() }).refine((x) => !!x.threadId || !!x.messageId, { message: 'Either threadId or messageId is required' });
const EmailArchiveOut = z.object({ ok: z.boolean() });

export function emailArchive(moduleRef: ModuleRef): Tool<z.infer<typeof EmailArchiveIn>, z.infer<typeof EmailArchiveOut>> {
    return {
        name: 'email.archive',
        in: EmailArchiveIn,
        out: EmailArchiveOut,
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

// ---------------- email.snooze ----------------
const EmailSnoozeIn = z.object({
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    until: z.string().datetime().describe('ISO datetime when the email should unsnooze'),
}).refine((x) => !!x.threadId || !!x.messageId, { message: 'Either threadId or messageId is required' });
const EmailSnoozeOut = z.object({ ok: z.boolean() });

export function emailSnooze(moduleRef: ModuleRef): Tool<z.infer<typeof EmailSnoozeIn>, z.infer<typeof EmailSnoozeOut>> {
    return {
        name: 'email.snooze',
        in: EmailSnoozeIn,
        out: EmailSnoozeOut,
        scopes: [],
        rate: '60/m',
        risk: 'low',
        async call(args) {
            const parsed = EmailSnoozeIn.parse(args);
            const svc = await resolveEmailService(moduleRef);
            await svc.snooze?.({ threadId: parsed.threadId, messageId: parsed.messageId }, new Date(parsed.until));
            return { ok: true } as any;
        },
    };
}

// Utility for planner: stable summary generation if needed by downstream
export function buildEmailSummary(to: string[], subject: string, body: string): string {
    // keep a lightweight local implementation to avoid ESM/CJS friction here
    const preview = body.slice(0, 100);
    return `${to[0]}: ${subject} — ${preview}`;
}
