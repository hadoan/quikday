import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';

// ---------------- email.setOutOfOffice ----------------
export const EmailSetOutOfOfficeIn = z.object({
  startDate: z
    .string()
    .describe('Start date in YYYY-MM-DD format (e.g., "2025-11-05")'),
  endDate: z
    .string()
    .describe('End date in YYYY-MM-DD format (e.g., "2025-11-06")'),
  message: z
    .string()
    .describe('Auto-reply message content (supports HTML)'),
  subject: z
    .string()
    .optional()
    .describe('Optional subject line for auto-reply (defaults to "Out of Office")'),
  timezone: z
    .string()
    .optional()
    .default('America/New_York')
    .describe('Timezone for date interpretation (e.g., "America/New_York", "Europe/Berlin")'),
});

export const EmailSetOutOfOfficeOut = z.object({
  ok: z.boolean(),
  startDate: z.string(),
  endDate: z.string(),
  message: z.string(),
  enabled: z.boolean(),
});

export type EmailSetOutOfOfficeArgs = z.infer<typeof EmailSetOutOfOfficeIn>;
export type EmailSetOutOfOfficeResult = z.infer<typeof EmailSetOutOfOfficeOut>;

export function emailSetOutOfOffice(
  moduleRef: ModuleRef,
): Tool<EmailSetOutOfOfficeArgs, EmailSetOutOfOfficeResult> {
  return {
    name: 'email.setOutOfOffice',
    description:
      'Set an out-of-office vacation responder (auto-reply) for Gmail. Automatically replies to incoming emails during the specified date range.',
    in: EmailSetOutOfOfficeIn,
    out: EmailSetOutOfOfficeOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '10/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const parsed = EmailSetOutOfOfficeIn.parse(args);

      // Parse dates and convert to epoch milliseconds
      // To cover the entire end date, set endTime to start of next day
      const startDate = new Date(`${parsed.startDate}T00:00:00`);
      const endDate = new Date(`${parsed.endDate}T23:59:59`);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD format.');
      }

      if (endDate < startDate) {
        throw new Error('End date must be after start date.');
      }

      const startTimeMs = startDate.getTime();
      const endTimeMs = endDate.getTime();

      // Get Gmail service
      const svc = await resolveEmailService(moduleRef);
      if (!svc) {
        throw new Error('Gmail service not available. Connect a Gmail account first.');
      }

      // Check if service has setVacationResponder method
      if (typeof (svc as any).setVacationResponder !== 'function') {
        throw new Error('Gmail vacation responder not supported by current email service.');
      }

      // Set vacation responder
      await (svc as any).setVacationResponder(
        startTimeMs,
        endTimeMs,
        parsed.message,
        parsed.subject || 'Out of Office',
      );

      return EmailSetOutOfOfficeOut.parse({
        ok: true,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        message: parsed.message,
        enabled: true,
      });
    },
  };
}
