import { z } from 'zod';
import type { Tool } from '../types';
import { ModuleRef } from '@nestjs/core';
import { CALENDAR_FACTORY } from '@quikday/appstore/calendar/calendar.tokens';
import type { CalendarFactory } from '@quikday/appstore/calendar/calendar.factory';
import { CurrentUserService } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';

// Shared schemas
const iso = z.string().min(10);
const email = z.string().email().min(3);

// ---------------- calendar.checkAvailability (slot finder) ----------------
export const CalendarCheckAvailabilityIn = z.object({
  /**
   * Window (inclusive start, exclusive end) to search for free slots.
   * Prefer ISO with timezone offset, e.g. 2025-11-03T00:00:00+01:00
   */
  startWindow: iso,
  endWindow: iso,

  /** Meeting length in minutes */
  durationMin: z.number().int().positive(),

  /**
   * Optional attendees to consider when checking availability.
   * If the underlying provider doesn't support attendee checks, it will be ignored.
   */
  attendees: z.array(email).min(1).optional(),

  /** Number of slots to return (default 3) */
  count: z.number().int().positive().default(3),

  /** Step size in minutes between candidate start times (default 30) */
  stepMin: z.number().int().positive().default(30),

  /** Local working hours in the window timezone (defaults 9 → 17) */
  workStartHour: z.number().int().min(0).max(23).default(9),
  workEndHour: z.number().int().min(1).max(24).default(17),

  /**
   * IANA timezone of the intended working hours interpretation.
   * Used only for metadata/echo; this implementation operates on provided ISO offsets.
   */
  window_tz: z.string().default('Europe/Berlin'),
});

export const CalendarCheckAvailabilityOut = z.object({
  /** True if at least one free slot is found */
  available: z.boolean(),

  /** Echo of inputs */
  startWindow: z.string(),
  endWindow: z.string(),
  durationMin: z.number(),
  window_tz: z.string(),

  /** Returned slots (up to `count`) */
  slots: z.array(z.object({
    start: z.string(),
    end: z.string(),
    /** Availability flag for this specific slot */
    available: z.boolean(),
  })),

  /** If available, the first available slot for convenience */
  firstAvailableStart: z.string().optional(),
  firstAvailableEnd: z.string().optional(),
});

export type CalendarCheckAvailabilityArgs = z.infer<typeof CalendarCheckAvailabilityIn>;
export type CalendarCheckAvailabilityResult = z.infer<typeof CalendarCheckAvailabilityOut>;

export function calendarCheckAvailability(
  moduleRef: ModuleRef,
): Tool<CalendarCheckAvailabilityArgs, CalendarCheckAvailabilityResult> {
  return {
    name: 'calendar.checkAvailability',
    description: 'Find available time slots within a date/time window. Searches for free slots during working hours and returns up to N available slots. Required: startWindow (ISO), endWindow (ISO), durationMin (meeting length in minutes).',
    in: CalendarCheckAvailabilityIn,
    out: CalendarCheckAvailabilityOut,
    scopes: [],
    rate: 'unlimited',
    risk: 'low',
    async call(args) {
      const {
        startWindow,
        endWindow,
        durationMin,
        attendees,
        count,
        stepMin,
        workStartHour,
        workEndHour,
        window_tz,
      } = args;

      const startW = new Date(startWindow);
      const endW = new Date(endWindow);

      // Guard: invalid window
      if (!(startW instanceof Date) || isNaN(startW.valueOf()) ||
          !(endW instanceof Date) || isNaN(endW.valueOf()) ||
          endW <= startW) {
        return {
          available: false,
          startWindow,
          endWindow,
          durationMin,
          window_tz,
          slots: [],
        };
      }

      try {
        const svc = await resolveGoogleCalendarService(moduleRef);

        // Generate candidate slots within working hours
        const slots: { start: Date; end: Date }[] = [];
        const stepMs = stepMin * 60_000;
        const durMs = durationMin * 60_000;

        // Iterate day by day
        for (
          let dayStart = startOfDayLike(startW);
          dayStart < endW && slots.length < count * 20; // hard cap on candidates
          dayStart = addDays(dayStart, 1)
        ) {
          // Build working-hours window for this day using the offset present on the Date.
          // Since inputs include offsets, Date arithmetic remains consistent in that offset context.
          const whStart = setTimeWithSameOffset(dayStart, workStartHour, 0, 0, 0);
          const whEnd = setTimeWithSameOffset(dayStart, workEndHour, 0, 0, 0);

          // Clamp to overall search window
          const dayWindowStart = maxDate(whStart, startW);
          const dayWindowEnd = minDate(whEnd, endW);

          // Skip if inverted or too short for one meeting
          if (dayWindowEnd.getTime() - dayWindowStart.getTime() < durMs) continue;

          // Step through candidate start times
          for (
            let s = alignToStep(dayWindowStart, stepMs);
            s.getTime() + durMs <= dayWindowEnd.getTime();
            s = new Date(s.getTime() + stepMs)
          ) {
            const e = new Date(s.getTime() + durMs);
            slots.push({ start: s, end: e });
            // Soft cap to avoid unbounded loops; we’ll filter by availability below.
            if (slots.length >= count * 50) break;
          }
        }

        // Check availability for each candidate until we collect `count` available ones
        const availableSlots: { start: string; end: string; available: boolean }[] = [];
        for (const cand of slots) {
          if (availableSlots.length >= count) break;

          const payload: any = { start: cand.start, end: cand.end };
          if (attendees && attendees.length) payload.attendees = attendees;

          let ok = false;
          try {
            const res = await svc.checkAvailability(payload);
            ok = !!res?.available;
          } catch {
            // If provider throws for attendee-aware calls, fallback to basic shape
            try {
              const res = await svc.checkAvailability({ start: cand.start, end: cand.end });
              ok = !!res?.available;
            } catch {
              ok = false;
            }
          }

          if (ok) {
            availableSlots.push({
              start: cand.start.toISOString(),
              end: cand.end.toISOString(),
              available: true,
            });
          }
        }

        const any = availableSlots.length > 0;
        return {
          available: any,
          startWindow,
          endWindow,
          durationMin,
          window_tz,
          slots: availableSlots.slice(0, count),
          firstAvailableStart: any ? availableSlots[0].start : undefined,
          firstAvailableEnd: any ? availableSlots[0].end : undefined,
        };
      } catch {
        // On any unexpected error, return a safe, structured response
        return {
          available: false,
          startWindow,
          endWindow,
          durationMin,
          window_tz,
          slots: [],
        };
      }
    },
  };
}

/* ---------------- helpers ---------------- */

function startOfDayLike(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
function setTimeWithSameOffset(d: Date, hh: number, mm: number, ss: number, ms: number): Date {
  const x = new Date(d);
  x.setHours(hh, mm, ss, ms);
  return x;
}
function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}
function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
function alignToStep(d: Date, stepMs: number): Date {
  const t = d.getTime();
  const rem = t % stepMs;
  return rem === 0 ? d : new Date(t + (stepMs - rem));
}

/* ---------------- service resolver ---------------- */

async function resolveGoogleCalendarService(moduleRef: ModuleRef): Promise<any> {
  // Prefer factory so services get constructed with proper dependencies
  const factory = moduleRef.get(CALENDAR_FACTORY as any, { strict: false }) as
    | CalendarFactory
    | undefined;
  if (factory && typeof (factory as any).create === 'function') {
    const currentUser = moduleRef.get(CurrentUserService, { strict: false });
    const prisma = moduleRef.get(PrismaService, { strict: false });
    if (!currentUser || !prisma) throw new Error('Missing CurrentUserService or PrismaService');
    // "google" is the provider key; adjust if you add others
    return (factory as any).create('google', { currentUser, prisma });
  }

  // Fallback: resolve concrete service directly for compatibility
  const m = await import('@quikday/appstore-google-calendar');
  const GoogleCalendarProviderService = (m as any).GoogleCalendarProviderService;
  const svc = moduleRef.get(GoogleCalendarProviderService as any, { strict: false });
  if (!svc) {
    throw new Error(
      'GoogleCalendarProviderService not found in Nest container. Ensure GoogleCalendarModule is imported.',
    );
  }
  return svc as any;
}
