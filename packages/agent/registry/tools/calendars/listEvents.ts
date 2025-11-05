import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveGoogleCalendarService } from './utils.js';

export const CalendarListIn = z.object({
  start: z.string(),
  end: z.string(),
  pageToken: z.string().optional(),
  pageSize: z.number().int().positive().max(250).optional(),
});
export const CalendarListOut = z.object({
  ok: z.boolean(),
  nextPageToken: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      start: z.string(),
      end: z.string(),
      attendeesCount: z.number().int().nonnegative().optional(),
    }),
  ),
});
export type CalendarListArgs = z.infer<typeof CalendarListIn>;
export type CalendarListResult = z.infer<typeof CalendarListOut>;

export function calendarListEvents(moduleRef: ModuleRef): Tool<CalendarListArgs, CalendarListResult> {
  return {
    name: 'calendar.listEvents',
    description:
      'List calendar events in a date/time range. Required: start (ISO), end (ISO). Optional: pageToken, pageSize (max 250).',
    in: CalendarListIn,
    out: CalendarListOut,
    apps: ['google-calendar'],
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args) {
      const svc = await resolveGoogleCalendarService(moduleRef);
      if (typeof svc.listEvents === 'function') {
        try {
          const res = await svc.listEvents({
            start: new Date(args.start),
            end: new Date(args.end),
            pageToken: args.pageToken,
            pageSize: args.pageSize,
          });
          const items = Array.isArray(res?.items)
            ? res.items.map((e: any) => ({
                id: String(e.id),
                title: e.title ?? e.summary,
                start: new Date(e.start).toISOString(),
                end: new Date(e.end).toISOString(),
                attendeesCount: Array.isArray(e.attendees) ? e.attendees.length : undefined,
              }))
            : [];
          return CalendarListOut.parse({ ok: true, nextPageToken: res?.nextPageToken, items });
        } catch (err) {
          console.warn('[calendar.listEvents] failed, returning empty list', {
            start: args.start,
            end: args.end,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return CalendarListOut.parse({ ok: true, items: [] });
    },
  };
}
