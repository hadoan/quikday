import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveHubspotService, resolveNumericUserId } from './utils.js';

export const HubspotUpdateMeetingIn = z.object({
  meetingId: z.string().min(1),
  title: z.string().optional(),
  startTime: z.union([z.string(), z.date()]).optional(),
  endTime: z.union([z.string(), z.date()]).optional(),
  location: z.string().optional(),
  body: z.string().optional(),
  outcome: z.enum(['SCHEDULED', 'RESCHEDULED', 'CANCELED', 'NO_SHOW']).optional(),
});

export const HubspotUpdateMeetingOut = z.object({ ok: z.boolean().default(true) });

export type HubspotUpdateMeetingArgs = z.infer<typeof HubspotUpdateMeetingIn>;
export type HubspotUpdateMeetingResult = z.infer<typeof HubspotUpdateMeetingOut>;

export function hubspotUpdateMeeting(
  moduleRef: ModuleRef,
): Tool<HubspotUpdateMeetingArgs, HubspotUpdateMeetingResult> {
  return {
    name: 'hubspot.meetings.update',
    description: 'Update a HubSpot meeting. Provide meetingId and any fields to change.',
    in: HubspotUpdateMeetingIn,
    out: HubspotUpdateMeetingOut,
    apps: ['hubspot-crm'],
    scopes: ['crm:write'],
    rate: '60/m',
    risk: 'low',
    async call(args: HubspotUpdateMeetingArgs, ctx: RunCtx) {
      const input = HubspotUpdateMeetingIn.parse(args);
      const svc = await resolveHubspotService(moduleRef);
      const userId = await resolveNumericUserId(moduleRef, ctx);
      await svc.updateMeeting(userId, input.meetingId, {
        title: input.title,
        startTime: input.startTime as any,
        endTime: input.endTime as any,
        location: input.location as any,
        body: input.body as any,
        outcome: input.outcome as any,
      });
      return { ok: true };
    },
  };
}

