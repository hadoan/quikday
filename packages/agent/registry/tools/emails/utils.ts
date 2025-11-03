import { ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import { EMAIL_FACTORY } from '@quikday/appstore/email/email.tokens';
import type { EmailFactory } from '@quikday/appstore/email/email.factory';
import { CurrentUserService } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';

export async function getEmailUtils() {
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

export async function resolveEmailService(moduleRef: ModuleRef): Promise<any> {
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

export function buildEmailSummary(to: string[], subject: string, body: string): string {
  // keep a lightweight local implementation to avoid ESM/CJS friction here
  const preview = body.slice(0, 100);
  return `${to[0]}: ${subject} — ${preview}`;
}
