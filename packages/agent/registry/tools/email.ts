import { z } from 'zod';
import type { Tool } from '../types';
import type { RunCtx } from '../../state/types';
import { ModuleRef } from '@nestjs/core';
import { EMAIL_FACTORY } from '@quikday/appstore/email/email.tokens';
import type { EmailFactory } from '@quikday/appstore/email/email.factory';
import { CurrentUserService } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';
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
  const generateEmailSummary = (to: string, subject: string, preview: string) =>
    `${to}: ${subject} — ${preview}`;
  return { parseEmailAddresses, validateEmailAddresses, formatEmailBody, generateEmailSummary };
}

async function resolveEmailService(moduleRef: ModuleRef): Promise<any> {
  // Prefer factory to construct provider with proper deps
  const factory = moduleRef.get(EMAIL_FACTORY as any, { strict: false }) as
    | EmailFactory
    | undefined;
  if (factory && typeof (factory as any).create === 'function') {
    const currentUser = moduleRef.get(CurrentUserService, { strict: false });
    const prisma = moduleRef.get(PrismaService, { strict: false });
    if (!currentUser || !prisma) throw new Error('Missing CurrentUserService or PrismaService');
    // For now default to gmail provider
    return (factory as any).create('gmail', { currentUser, prisma });
  }

  // Fallback: resolve concrete service
  const m = await import('@quikday/appstore-gmail-email');
  const GmailEmailService = (m as any).GmailEmailService;
  return moduleRef.get(GmailEmailService as any, { strict: false }) as any;
}

export type EmailSendArgs = z.infer<typeof EmailSendIn>;
export type EmailSendResult = z.infer<typeof EmailSendOut>;

export function emailSend(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailSendIn>, z.infer<typeof EmailSendOut>> {
  return {
    name: 'email.send',
    description: 'Send an email message. Required: to (comma-separated), subject, body. Optional: cc, bcc, html (boolean).',
    in: EmailSendIn,
    out: EmailSendOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const parsed = EmailSendIn.parse(args);
      const { parseEmailAddresses, validateEmailAddresses, formatEmailBody } =
        await getEmailUtils();
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

export const EmailReadIn = z.object({
  query: z.string().optional().describe('Search query (provider-specific syntax)'),
  limit: z.number().int().positive().max(50).default(10),
  from: z.string().optional(),
  to: z.string().optional(),
  newerThanDays: z.number().int().positive().max(365).optional(),
});

export const EmailReadOut = z.object({
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

export type EmailReadArgs = z.infer<typeof EmailReadIn>;
export type EmailReadResult = z.infer<typeof EmailReadOut>;

export function emailRead(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailReadIn>, z.infer<typeof EmailReadOut>> {
  return {
    name: 'email.read',
    description: 'Search and read emails. Optional: query (search string), maxResults (default 10), newerThanDays, labels.',
    in: EmailReadIn,
    out: EmailReadOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const parsed = EmailReadIn.parse(args);
      const svc = await resolveEmailService(moduleRef);
      if (!svc?.search) throw new Error('Email service not available');

      const newerThan = parsed.newerThanDays
        ? new Date(Date.now() - parsed.newerThanDays * 24 * 60 * 60 * 1000)
        : undefined;
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
): Tool<z.infer<typeof EmailMessageGetIn>, z.infer<typeof EmailMessageGetOut>> {
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

// ---------------- email.thread.get ----------------
export const EmailThreadGetIn = z.object({ threadId: z.string() });
export const EmailThreadGetOut = z.object({
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

export type EmailThreadGetArgs = z.infer<typeof EmailThreadGetIn>;
export type EmailThreadGetResult = z.infer<typeof EmailThreadGetOut>;

export function emailThreadGet(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailThreadGetIn>, z.infer<typeof EmailThreadGetOut>> {
  return {
    name: 'email.thread.get',
    description: 'Get all messages in an email thread. Required: threadId.',
    in: EmailThreadGetIn,
    out: EmailThreadGetOut,
    apps: ['gmail-email'],
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
export const EmailDraftCreateIn = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  isHtml: z.boolean().optional().default(false),
});
export const EmailDraftCreateOut = z.object({
  ok: z.boolean(),
  draftId: z.string(),
  threadId: z.string().optional(),
});

export type EmailDraftCreateArgs = z.infer<typeof EmailDraftCreateIn>;
export type EmailDraftCreateResult = z.infer<typeof EmailDraftCreateOut>;

export function emailDraftCreate(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailDraftCreateIn>, z.infer<typeof EmailDraftCreateOut>> {
  return {
    name: 'email.draft.create',
    description: 'Create an email draft (not sent). Required: to, subject, body. Optional: cc, bcc, html.',
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
      } as any;
      const res = await svc.createDraft(draft);
      return EmailDraftCreateOut.parse({ ok: true, draftId: res.draftId, threadId: res.threadId });
    },
  };
}

// ---------------- email.draft.send ----------------
export const EmailDraftSendIn = z.object({ draftId: z.string() });
export const EmailDraftSendOut = z.object({
  ok: z.boolean(),
  messageId: z.string(),
  threadId: z.string(),
});

export type EmailDraftSendArgs = z.infer<typeof EmailDraftSendIn>;
export type EmailDraftSendResult = z.infer<typeof EmailDraftSendOut>;

export function emailDraftSend(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailDraftSendIn>, z.infer<typeof EmailDraftSendOut>> {
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

// ---------------- email.labels.change ----------------
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

export function emailLabelsChange(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailLabelsChangeIn>, z.infer<typeof EmailLabelsChangeOut>> {
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

// ---------------- email.archive ----------------
export const EmailArchiveIn = z
  .object({ threadId: z.string().optional(), messageId: z.string().optional() })
  .refine((x) => !!x.threadId || !!x.messageId, {
    message: 'Either threadId or messageId is required',
  });
export const EmailArchiveOut = z.object({ ok: z.boolean() });

export type EmailArchiveArgs = z.infer<typeof EmailArchiveIn>;
export type EmailArchiveResult = z.infer<typeof EmailArchiveOut>;

export function emailArchive(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailArchiveIn>, z.infer<typeof EmailArchiveOut>> {
  return {
    name: 'email.archive',
    description: 'Archive an email thread or message (removes from inbox). Required: threadId or messageId.',
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

// ---------------- email.snooze ----------------
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

export function emailSnooze(
  moduleRef: ModuleRef,
): Tool<z.infer<typeof EmailSnoozeIn>, z.infer<typeof EmailSnoozeOut>> {
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

// Utility for planner: stable summary generation if needed by downstream
export function buildEmailSummary(to: string[], subject: string, body: string): string {
  // keep a lightweight local implementation to avoid ESM/CJS friction here
  const preview = body.slice(0, 100);
  return `${to[0]}: ${subject} — ${preview}`;
}
