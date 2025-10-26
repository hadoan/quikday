/**
 * Base calendar tool schema and types
 * Can be extended by specific calendar providers
 */
import { z } from 'zod';

/**
 * Standard calendar event schema
 * Used across all calendar integrations
 */
export const baseCalendarEventSchema = z
  .object({
    title: z.string().describe("Event title, e.g., 'Check-in with Sara'"),
    start: z.string().describe("ISO or HH:MM today, e.g., '2025-10-18T09:00' or '10:00'"),
    end: z.string().optional().describe("ISO or HH:MM today, e.g., '2025-10-18T09:30' or '10:30'"),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(480)
      .optional()
      .describe('If no end provided, duration in minutes (default 30).'),
    attendees: z.string().optional().describe('Comma-separated emails or names'),
    location: z.string().optional().describe('Room/URL/address'),
    description: z.string().optional().describe('Event description or notes'),
  })
  .describe('Create/update a calendar event; if end is omitted, use durationMinutes (default 30).');

export type BaseCalendarEvent = z.infer<typeof baseCalendarEventSchema>;

/**
 * Calendar event response format
 */
export interface CalendarEventResponse {
  success: boolean;
  message: string;
  eventId?: string;
  startIso?: string;
  endIso?: string;
}

