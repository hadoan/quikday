import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveHubspotService, resolveNumericUserId } from './utils.js';

export const HubspotCreateContactsIn = z.object({
  contacts: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
      }),
    )
    .min(1),
});

export const HubspotCreateContactsOut = z.object({
  created: z.array(z.object({ id: z.string(), email: z.string().email() })),
});

export type HubspotCreateContactsArgs = z.infer<typeof HubspotCreateContactsIn>;
export type HubspotCreateContactsResult = z.infer<typeof HubspotCreateContactsOut>;

export function hubspotCreateContacts(
  moduleRef: ModuleRef,
): Tool<HubspotCreateContactsArgs, HubspotCreateContactsResult> {
  return {
    name: 'hubspot.contacts.create',
    description: 'Create HubSpot contacts. Required: contacts array with email and optional name.',
    in: HubspotCreateContactsIn,
    out: HubspotCreateContactsOut,
    apps: ['hubspot-crm'],
    scopes: ['crm:write'],
    rate: '60/m',
    risk: 'low',
    async call(args: HubspotCreateContactsArgs, ctx: RunCtx) {
      const input = HubspotCreateContactsIn.parse(args);
      const svc = await resolveHubspotService(moduleRef);
      const userId = await resolveNumericUserId(moduleRef, ctx);
      const created = await svc.createContacts(userId, input.contacts);
      return HubspotCreateContactsOut.parse({ created });
    },
  };
}

