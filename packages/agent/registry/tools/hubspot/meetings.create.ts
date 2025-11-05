import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveHubspotService, resolveNumericUserId } from './utils.js';

export const HubspotCreateMeetingIn = z.object({
  title: z.string().min(1),
  startTime: z.union([z.string(), z.date()]).describe('ISO datetime string or Date'),
  endTime: z.union([z.string(), z.date()]).describe('ISO datetime string or Date'),
  location: z.string().optional(),
  body: z.string().optional(),
  contactEmails: z.array(z.string().email()).optional(),
});

export const HubspotCreateMeetingOut = z.object({ id: z.string() });

export type HubspotCreateMeetingArgs = z.infer<typeof HubspotCreateMeetingIn>;
export type HubspotCreateMeetingResult = z.infer<typeof HubspotCreateMeetingOut>;

export function hubspotCreateMeeting(
  moduleRef: ModuleRef,
): Tool<HubspotCreateMeetingArgs, HubspotCreateMeetingResult> {
  return {
    name: 'hubspot.meetings.create',
    description:
      'Create a HubSpot meeting with optional associated contacts (by email). Required: title, startTime, endTime.',
    in: HubspotCreateMeetingIn,
    out: HubspotCreateMeetingOut,
    apps: ['hubspot-crm'],
    scopes: ['crm:write'],
    rate: '30/m',
    risk: 'low',
    async call(args: HubspotCreateMeetingArgs, ctx: RunCtx) {
      const input = HubspotCreateMeetingIn.parse(args);
      const svc = await resolveHubspotService(moduleRef);
      const userId = await resolveNumericUserId(moduleRef, ctx);

      let contactIds: string[] | undefined = undefined;
      if (Array.isArray(input.contactEmails) && input.contactEmails.length > 0) {
        const found = await svc.findContactsByEmails(userId, input.contactEmails);
        const foundMap = new Map(found.map((c: any) => [c.email.toLowerCase(), c.id]));
        const missing = input.contactEmails.filter((e) => !foundMap.has(e.toLowerCase()));
        if (missing.length > 0) {
          const created = await svc.createContacts(
            userId,
            missing.map((email) => ({ email })),
          );
          for (const c of created) foundMap.set(c.email.toLowerCase(), c.id);
        }
        contactIds = input.contactEmails
          .map((e) => foundMap.get(e.toLowerCase()))
          .filter((x): x is string => !!x);
      }

      const res = await svc.createMeeting(userId, {
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        body: input.body,
        contactIds,
      });
      return HubspotCreateMeetingOut.parse(res);
    },
  };
}

