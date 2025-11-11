import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveGoogleCalendarService, normalizeAttendees } from './utils.js';

export const CalendarUpdateIn = z.object({
  eventId: z.string(),
  title: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  attendees: z.union([z.string(), z.array(z.string())]).optional(),
  location: z.string().optional(),
});
export const CalendarUpdateOut = z.object({ ok: z.boolean() });
export type CalendarUpdateArgs = z.infer<typeof CalendarUpdateIn>;
export type CalendarUpdateResult = z.infer<typeof CalendarUpdateOut>;

export function calendarUpdateEvent(
  moduleRef: ModuleRef,
): Tool<CalendarUpdateArgs, CalendarUpdateResult> {
  return {
    name: 'calendar.updateEvent',
    description:
      'Update an existing calendar event. Required: eventId. Optional: title, start (ISO), end (ISO), attendees, location.',
    in: CalendarUpdateIn,
    out: CalendarUpdateOut,
    apps: ['google-calendar'],
    scopes: [],
    rate: '60/m',
    risk: 'high',
    async call(args) {
      const svc = await resolveGoogleCalendarService(moduleRef);
      if (typeof svc.updateEvent === 'function') {
        await svc.updateEvent(args.eventId, {
          title: args.title,
          start: args.start ? new Date(args.start) : undefined,
          end: args.end ? new Date(args.end) : undefined,
          attendees: Array.isArray(args.attendees)
            ? (args.attendees as string[]).map((e) => ({ email: e }))
            : typeof args.attendees === 'string'
              ? normalizeAttendees(args.attendees)?.map((e: string) => ({ email: e }))
              : undefined,
          location: args.location,
        } as any);
      }
      return { ok: true } as any;
    },
  };
}
