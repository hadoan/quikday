import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveGoogleCalendarService } from './utils.js';

export const CalendarCancelIn = z.object({ eventId: z.string() });
export const CalendarCancelOut = z.object({ ok: z.boolean() });
export type CalendarCancelArgs = z.infer<typeof CalendarCancelIn>;
export type CalendarCancelResult = z.infer<typeof CalendarCancelOut>;

export function calendarCancelEvent(moduleRef: ModuleRef): Tool<CalendarCancelArgs, CalendarCancelResult> {
  return {
    name: 'calendar.cancelEvent',
    description: 'Cancel (delete) a calendar event. Required: eventId.',
    in: CalendarCancelIn,
    out: CalendarCancelOut,
    apps: ['google-calendar'],
    scopes: [],
    rate: '60/m',
    risk: 'high',
    async call(args) {
      const svc = await resolveGoogleCalendarService(moduleRef);
      if (typeof svc.deleteEvent === 'function') {
        await svc.deleteEvent(args.eventId);
      }
      return { ok: true } as any;
    },
  };
}
