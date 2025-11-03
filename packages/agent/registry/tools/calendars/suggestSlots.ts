import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveGoogleCalendarService } from './utils.js';

export const CalendarSuggestIn = z.object({
  windowStart: z.string(),
  windowEnd: z.string(),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  bufferBeforeMinutes: z.number().int().nonnegative().max(240).optional(),
  bufferAfterMinutes: z.number().int().nonnegative().max(240).optional(),
  count: z.number().int().positive().max(20).default(5),
  timezone: z.string().optional(),
  attendees: z.union([z.string(), z.array(z.string())]).optional(),
});
export const CalendarSuggestOut = z.object({
  ok: z.boolean(),
  slots: z.array(z.object({ start: z.string(), end: z.string() })),
});
export type CalendarSuggestArgs = z.infer<typeof CalendarSuggestIn>;
export type CalendarSuggestResult = z.infer<typeof CalendarSuggestOut>;

export function calendarSuggestSlots(moduleRef: ModuleRef): Tool<CalendarSuggestArgs, CalendarSuggestResult> {
  return {
    name: 'calendar.suggestSlots',
    description:
      'Suggest available meeting time slots. Required: windowStart (ISO), windowEnd (ISO), durationMinutes. Optional: bufferBeforeMinutes, bufferAfterMinutes, count (default 5, max 20), timezone, attendees.',
    in: CalendarSuggestIn,
    out: CalendarSuggestOut,
    apps: ['google-calendar'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args) {
      const svc = await resolveGoogleCalendarService(moduleRef);
      const windowStart = new Date(args.windowStart);
      const windowEnd = new Date(args.windowEnd);
      const durationMs = args.durationMinutes * 60 * 1000;
      const candidates: { start: Date; end: Date }[] = [];
      const stepMs = 30 * 60 * 1000; // 30-min step
      for (let t = windowStart.getTime(); t + durationMs <= windowEnd.getTime(); t += stepMs) {
        const s = new Date(t);
        const e = new Date(t + durationMs);
        candidates.push({ start: s, end: e });
      }
      const attendees = Array.isArray(args.attendees)
        ? (args.attendees as string[])
        : typeof args.attendees === 'string'
        ? args.attendees
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

      const slots: { start: string; end: string }[] = [];
      for (const c of candidates) {
        if (slots.length >= args.count) break;
        try {
          const ok = await svc.checkAvailability({ start: c.start, end: c.end, attendees });
          if (ok?.available) {
            slots.push({ start: c.start.toISOString(), end: c.end.toISOString() });
          }
        } catch (err) {
          console.warn('[calendar.suggestSlots] availability check failed for candidate', {
            start: c.start.toISOString(),
            end: c.end.toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return CalendarSuggestOut.parse({ ok: true, slots });
    },
  };
}
