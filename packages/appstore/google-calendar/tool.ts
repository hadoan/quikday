/**
 * Google Calendar Tool Factory
 * Creates LangChain tool for calendar events - to be used by agent package
 */
import { z } from 'zod';
import { baseCalendarEventSchema } from '@quikday/appstore';
import type { calendar_v3 } from 'googleapis';

import GoogleCalendarService from './lib/CalendarService.js';

const googleCalendarService = new GoogleCalendarService();

const eventReminderSchema = z.object({
  method: z.string().optional().describe('Notification method, e.g., email or popup'),
  minutes: z.number().int().nonnegative().optional().describe('Minutes before the event'),
});

const eventRemindersSchema = z
  .object({
    useDefault: z.boolean().optional().describe('Use calendar default reminders'),
    overrides: z.array(eventReminderSchema).optional().describe('Custom reminders'),
  })
  .optional();

const googleCalendarToolSchema = baseCalendarEventSchema.extend({
  calendarId: z
    .string()
    .optional()
    .describe('External calendar id to insert into (defaults to primary).'),
  timeZone: z.string().optional().describe('IANA timezone to store the event under.'),
  sendUpdates: z
    .enum(['all', 'externalOnly', 'none'])
    .optional()
    .describe('Who receives update emails when the event changes.'),
  reminders: eventRemindersSchema,
});

export type GoogleCalendarToolInput = z.infer<typeof googleCalendarToolSchema>;

/**
 * Core logic for creating a Google Calendar event
 * This can be called by the LangChain tool in the agent package
 * @param input - Tool input from LLM (without userId)
 * @param userId - User ID from execution context (injected by RunProcessor)
 */
export async function createGoogleCalendarEvent(
  input: GoogleCalendarToolInput,
  userId: number,
): Promise<string> {
  const { calendarId, timeZone, sendUpdates, reminders, ...eventData } =
    googleCalendarToolSchema.parse(input);

  const result = await googleCalendarService.createCalendarEvent(userId, {
    ...eventData,
    calendarId,
    timeZone,
    sendUpdates,
    reminders: reminders as calendar_v3.Schema$Event['reminders'] | undefined,
  });

  if (!result.success) {
    throw new Error(result.message || 'Failed to create Google Calendar event');
  }

  const lines = [result.message];
  if (result.startIso && result.endIso) {
    lines.push(`🕐 ${result.startIso} to ${result.endIso}`);
  }
  if (result.eventId) {
    lines.push(`🆔 Event ID: ${result.eventId}`);
  }

  return lines.join('\n');
}

/**
 * Tool metadata for agent registration
 */
export const googleCalendarToolMetadata = {
  name: 'create_google_calendar_event',
  description: 'Create a calendar event in Google Calendar using the connected user credential.',
  schema: googleCalendarToolSchema,
  handler: createGoogleCalendarEvent,
};

/**
 * Future: Add more Google Calendar operations
 */
// export async function updateGoogleCalendarEvent(input: UpdateEventInput): Promise<string> { ... }
// export async function deleteGoogleCalendarEvent(input: DeleteEventInput): Promise<string> { ... }
// export async function listGoogleCalendarEvents(input: ListEventsInput): Promise<string> { ... }
