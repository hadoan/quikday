import { z } from 'zod';
import type { Tool } from '../types';

// Shared schemas
const iso = z.string().min(10);

export const calendarCheckAvailability: Tool<
  {
    start: string;
    end: string;
    attendees?: string | string[];
  },
  { available: boolean; start: string; end: string; attendees?: string[] }
> = {
  name: 'calendar.checkAvailability',
  in: z.object({ start: iso, end: iso, attendees: z.union([z.string(), z.array(z.string())]).optional() }),
  out: z.object({ available: z.boolean(), start: z.string(), end: z.string(), attendees: z.array(z.string()).optional() }),
  scopes: [],
  rate: 'unlimited',
  risk: 'low',
  call: async (args) => {
    const attendees = Array.isArray(args.attendees)
      ? args.attendees
      : typeof args.attendees === 'string'
        ? args.attendees.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
    // Stub: assume available; real impl would query provider API.
    return { available: true, start: args.start, end: args.end, attendees };
  },
};

export const calendarCreateEvent: Tool<
  {
    title: string;
    start: string;
    end: string;
    attendees?: string | string[];
    notifyAttendees?: boolean;
    location?: string;
  },
  { ok: true; eventId: string; htmlLink?: string; start: string; end: string }
> = {
  name: 'calendar.createEvent',
  in: z.object({
    title: z.string().default('Event'),
    start: iso,
    end: iso,
    attendees: z.union([z.string(), z.array(z.string())]).optional(),
    notifyAttendees: z.boolean().optional(),
    location: z.string().optional(),
  }),
  out: z.object({ ok: z.literal(true), eventId: z.string(), htmlLink: z.string().optional(), start: z.string(), end: z.string() }),
  scopes: [],
  rate: 'unlimited',
  risk: 'high',
  call: async (args) => {
    // For now, stub out an event id. Integrate with appstore/google-calendar later.
    const eventId = `evt_${Math.random().toString(36).slice(2, 10)}`;
    return { ok: true, eventId, start: args.start, end: args.end };
  },
};

