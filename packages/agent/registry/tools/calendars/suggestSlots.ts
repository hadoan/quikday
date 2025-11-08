import { z } from 'zod';
import type { Tool } from '../../types.js';
import { ModuleRef } from '@nestjs/core';
import {
  resolveGoogleCalendarService,
  normalizeAttendees,
  startOfDayLike,
  addDays,
  setTimeWithSameOffset,
  maxDate,
  minDate,
  alignToStep,
} from './utils.js';

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
  // Optional UI hints so frontends can render without hardcoding
  presentation: z
    .object({
      type: z.enum(['slots', 'table', 'text']).default('slots'),
      tz: z.string().optional(),
      datetimePaths: z.array(z.string()).optional(),
    })
    .optional(),
});
export type CalendarSuggestArgs = z.infer<typeof CalendarSuggestIn>;
export type CalendarSuggestResult = z.infer<typeof CalendarSuggestOut>;

export function calendarSuggestSlots(
  moduleRef: ModuleRef,
): Tool<CalendarSuggestArgs, CalendarSuggestResult> {
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
      const durationMs = args.durationMinutes * 60_000;
      const stepMs = 30 * 60_000; // 30-min step
      const workStartHour = 9;
      const workEndHour = 17;
      const bufBefore = Math.max(0, args.bufferBeforeMinutes ?? 0) * 60_000;
      const bufAfter = Math.max(0, args.bufferAfterMinutes ?? 0) * 60_000;
      const attendees = normalizeAttendees(args.attendees) ?? [];

      // Guard: invalid window
      if (
        !(windowStart instanceof Date) || isNaN(windowStart.valueOf()) ||
        !(windowEnd instanceof Date) || isNaN(windowEnd.valueOf()) ||
        windowEnd <= windowStart
      ) {
        return { ok: true, slots: [] };
      }

      // Build candidate slots day-by-day within working hours using the offset present on inputs
      const candidates: { start: Date; end: Date }[] = [];

      for (
        let day = startOfDayLike(windowStart);
        day < windowEnd && candidates.length < (args.count ?? 5) * 20;
        day = addDays(day, 1)
      ) {
        const whStart = setTimeWithSameOffset(day, workStartHour, 0, 0, 0);
        const whEnd = setTimeWithSameOffset(day, workEndHour, 0, 0, 0);

        const dayWindowStart = maxDate(whStart, windowStart);
        const dayWindowEnd = minDate(whEnd, windowEnd);
        if (dayWindowEnd.getTime() - dayWindowStart.getTime() < durationMs) continue;

        for (
          let s = alignToStep(dayWindowStart, stepMs);
          s.getTime() + durationMs <= dayWindowEnd.getTime();
          s = new Date(s.getTime() + stepMs)
        ) {
          const e = new Date(s.getTime() + durationMs);
          candidates.push({ start: s, end: e });
          if (candidates.length >= (args.count ?? 5) * 50) break;
        }
      }

      // Check availability with optional buffers
      // Prefer at most one slot per calendar day (spread across different dates)
      const out: { start: string; end: string }[] = [];
      const selectedDates = new Set<string>(); // YYYY-MM-DD (UTC)
      for (const cand of candidates) {
        if (out.length >= (args.count ?? 5)) break;
        const dayKey = cand.start.toISOString().slice(0, 10);
        if (selectedDates.has(dayKey)) continue; // already picked a slot for this date
        const checkStart = new Date(cand.start.getTime() - bufBefore);
        const checkEnd = new Date(cand.end.getTime() + bufAfter);
        try {
          const res = await svc.checkAvailability({ start: checkStart, end: checkEnd, attendees });
          if (res?.available) {
            out.push({ start: cand.start.toISOString(), end: cand.end.toISOString() });
            selectedDates.add(dayKey);
          }
        } catch (err) {
          console.warn('[calendar.suggestSlots] availability check failed for candidate', {
            start: cand.start.toISOString(),
            end: cand.end.toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return CalendarSuggestOut.parse({
        ok: true,
        slots: out,
        presentation: {
          type: 'slots',
          tz: args.timezone || 'user',
          datetimePaths: ['slots[*].start', 'slots[*].end'],
        },
      });
    },
  };
}
