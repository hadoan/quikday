import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveGoogleCalendarService } from './utils.js';

export const CalendarFreeBusyIn = z.object({
  start: z.string(),
  end: z.string(),
  calendars: z.union([z.string(), z.array(z.string())]).optional(),
});
export const CalendarFreeBusyOut = z.object({
  ok: z.boolean(),
  busy: z.array(
    z.object({
      calendarId: z.string(),
      slots: z.array(z.object({ start: z.string(), end: z.string() })),
    }),
  ),
});
export type CalendarFreeBusyArgs = z.infer<typeof CalendarFreeBusyIn>;
export type CalendarFreeBusyResult = z.infer<typeof CalendarFreeBusyOut>;

export function calendarFreeBusy(
  moduleRef: ModuleRef,
): Tool<CalendarFreeBusyArgs, CalendarFreeBusyResult> {
  return {
    name: 'calendar.freeBusy',
    description:
      'Check free/busy status for calendars in a time range. Required: start (ISO), end (ISO). Optional: calendars (string or array).',
    in: CalendarFreeBusyIn,
    out: CalendarFreeBusyOut,
    apps: ['google-calendar'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args) {
      const svc = await resolveGoogleCalendarService(moduleRef);
      const res = await svc.checkAvailability({
        start: new Date(args.start),
        end: new Date(args.end),
      });
      const busy = res.available ? [] : [{ start: args.start, end: args.end }];
      const ids = Array.isArray(args.calendars)
        ? args.calendars
        : args.calendars
          ? [args.calendars]
          : ['primary'];
      return CalendarFreeBusyOut.parse({
        ok: true,
        busy: ids.map((id) => ({ calendarId: id, slots: busy })),
      });
    },
  };
}
