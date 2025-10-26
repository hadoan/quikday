import { z } from 'zod';
import type { Tool } from '../types';
import type { RunCtx } from '../../state/types';
import {
    baseEmailSchema,
    parseEmailAddresses,
    validateEmailAddresses,
    formatEmailBody,
    textToHtml,
    generateEmailSummary,
} from '@quikday/appstore';

// ---------------- email.send ----------------

const EmailSendIn = baseEmailSchema.extend({
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

export const emailSend: Tool<z.infer<typeof EmailSendIn>, z.infer<typeof EmailSendOut>> = {
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
        const svc = (ctx as any)?.services?.email;
        if (svc?.send && typeof svc.send === 'function') {
            const res = await svc.send(parsed);
            // Expect shape: { ok, messageId }
            return EmailSendOut.parse({
                ok: Boolean(res?.ok ?? true),
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
