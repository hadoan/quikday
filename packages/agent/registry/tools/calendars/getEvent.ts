import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveGoogleCalendarService } from './utils.js';

export const CalendarGetIn = z.object({ eventId: z.string() });
export const CalendarGetOut = z.object({
  ok: z.boolean(),
  event: z
    .object({
      id: z.string(),
      title: z.string().optional(),
      start: z.string(),
      end: z.string(),
      location: z.string().optional(),
      htmlLink: z.string().optional(),
    })
    .nullable(),
});
export type CalendarGetArgs = z.infer<typeof CalendarGetIn>;
export type CalendarGetResult = z.infer<typeof CalendarGetOut>;

export function calendarGetEvent(moduleRef: ModuleRef): Tool<CalendarGetArgs, CalendarGetResult> {
  return {
    name: 'calendar.getEvent',
    description: 'Get details of a specific calendar event by ID. Required: eventId.',
    in: CalendarGetIn,
    out: CalendarGetOut,
    apps: ['google-calendar'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args) {
      const svc = await resolveGoogleCalendarService(moduleRef);
      if (typeof svc.getEvent === 'function') {
        const ev = await svc.getEvent(args.eventId);
        if (ev) {
          return CalendarGetOut.parse({
            ok: true,
            event: {
              id: ev.id,
              title: ev.title,
              start: ev.start.toISOString(),
              end: ev.end.toISOString(),
              location: ev.location,
              htmlLink: ev.htmlLink,
            },
          });
        }
        return CalendarGetOut.parse({ ok: true, event: null });
      }
      return CalendarGetOut.parse({ ok: true, event: null });
    },
  };
}
