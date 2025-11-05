import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveHubspotService, resolveNumericUserId } from './utils.js';

export const HubspotFindContactsIn = z.object({
  emails: z.union([z.string(), z.array(z.string())]).describe('Email or list of emails'),
});

export const HubspotFindContactsOut = z.object({
  contacts: z.array(z.object({ id: z.string(), email: z.string() })),
});

export type HubspotFindContactsArgs = z.infer<typeof HubspotFindContactsIn>;
export type HubspotFindContactsResult = z.infer<typeof HubspotFindContactsOut>;

export function hubspotFindContactsByEmail(
  moduleRef: ModuleRef,
): Tool<HubspotFindContactsArgs, HubspotFindContactsResult> {
  return {
    name: 'hubspot.contacts.findByEmail',
    description: 'Find HubSpot contacts by email address(es).',
    in: HubspotFindContactsIn,
    out: HubspotFindContactsOut,
    apps: ['hubspot-crm'],
    scopes: ['crm:read'],
    rate: '60/m',
    risk: 'low',
    async call(args: HubspotFindContactsArgs, ctx: RunCtx) {
      const input = HubspotFindContactsIn.parse(args);
      const emails = Array.isArray(input.emails)
        ? input.emails
        : String(input.emails)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      if (emails.length === 0) return { contacts: [] };

      const svc = await resolveHubspotService(moduleRef);
      const userId = await resolveNumericUserId(moduleRef, ctx);
      const contacts = await svc.findContactsByEmails(userId, emails);
      return HubspotFindContactsOut.parse({ contacts });
    },
  };
}

