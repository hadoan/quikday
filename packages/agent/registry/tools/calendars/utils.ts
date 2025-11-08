import { ModuleRef } from '@nestjs/core';
import { CALENDAR_FACTORY } from '@quikday/appstore/calendar/calendar.tokens';
import type { CalendarFactory } from '@quikday/appstore/calendar/calendar.factory';
import { CurrentUserService } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';
import { GoogleCalendarProviderService } from '@quikday/appstore-google-calendar';

export const iso = (s: string) => s; // lightweight placeholder for shared ISO string shape

export async function resolveGoogleCalendarService(moduleRef: ModuleRef): Promise<GoogleCalendarProviderService> {
  // Prefer factory so services get constructed with proper dependencies
  const factory = moduleRef.get(CALENDAR_FACTORY as any, { strict: false }) as
    | CalendarFactory
    | undefined;
  if (factory && typeof (factory as any).create === 'function') {
    const currentUser = moduleRef.get(CurrentUserService, { strict: false });
    const prisma = moduleRef.get(PrismaService, { strict: false });
    if (!currentUser || !prisma) throw new Error('Missing CurrentUserService or PrismaService');
    return (factory as any).create('google', { currentUser, prisma });
  }

  // Fallback: resolve concrete service directly for compatibility
  const m = await import('@quikday/appstore-google-calendar');
  const GoogleCalendarProviderService = (m as any).GoogleCalendarProviderService;
  const svc = moduleRef.get(GoogleCalendarProviderService as any, { strict: false });
  if (!svc) {
    throw new Error(
      'GoogleCalendarProviderService not found in Nest container. Ensure GoogleCalendarModule is imported into the worker module so DI can provide it.',
    );
  }
  return svc as any;
}

export function normalizeAttendees(attendees?: string | string[]) {
  if (Array.isArray(attendees)) return attendees;
  if (typeof attendees === 'string') return attendees.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}

/* ---------------- Date/Time Helpers ---------------- */

export function startOfDayLike(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export function setTimeWithSameOffset(d: Date, hh: number, mm: number, ss: number, ms: number): Date {
  const x = new Date(d);
  x.setHours(hh, mm, ss, ms);
  return x;
}

export function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

export function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

export function alignToStep(d: Date, stepMs: number): Date {
  const t = d.getTime();
  const rem = t % stepMs;
  return rem === 0 ? d : new Date(t + (stepMs - rem));
}
