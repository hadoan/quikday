/**
 * Google Calendar Tool Factory
 * Creates LangChain tool for calendar events - to be used by agent package
 */
import { baseCalendarEventSchema, toIsoFromStartAndMaybeEnd } from '@quikday/appstore';
import type { BaseCalendarEvent } from '@quikday/appstore';

export interface GoogleCalendarToolInput extends BaseCalendarEvent {}

/**
 * Core logic for creating a Google Calendar event
 * This can be called by the LangChain tool in the agent package
 */
export async function createGoogleCalendarEvent(
  input: GoogleCalendarToolInput,
): Promise<string> {
  const { title, start, end, durationMinutes, attendees, location, description } =
    baseCalendarEventSchema.parse(input);

  // Convert to ISO timestamps
  const { startIso, endIso } = toIsoFromStartAndMaybeEnd(start, end, durationMinutes);

  // Format response message
  const withAtt = attendees ? ` with ${attendees}` : '';
  const where = location ? ` @ ${location}` : '';
  const notes = description ? `\nNotes: ${description}` : '';

  // TODO: Actual Google Calendar API call would go here
  // Example:
  // const calendar = google.calendar({ version: 'v3', auth });
  // const event = await calendar.events.insert({
  //   calendarId: 'primary',
  //   requestBody: {
  //     summary: title,
  //     start: { dateTime: startIso },
  //     end: { dateTime: endIso },
  //     attendees: attendees?.split(',').map(email => ({ email: email.trim() })),
  //     location,
  //     description,
  //   },
  // });

  return (
    `📅 Google Calendar Event '${title}' created\n` +
    `🕐 ${startIso} to ${endIso}${withAtt}${where}${notes}`
  );
}

/**
 * Tool metadata for agent registration
 */
export const googleCalendarToolMetadata = {
  name: 'create_google_calendar_event',
  description:
    'Create a calendar event in Google Calendar. If end time is omitted, default duration is 30 minutes. Supports flexible time formats (ISO or HH:MM).',
  schema: baseCalendarEventSchema,
  handler: createGoogleCalendarEvent,
};

/**
 * Future: Add more Google Calendar operations
 */
// export async function updateGoogleCalendarEvent(input: UpdateEventInput): Promise<string> { ... }
// export async function deleteGoogleCalendarEvent(input: DeleteEventInput): Promise<string> { ... }
// export async function listGoogleCalendarEvents(input: ListEventsInput): Promise<string> { ... }

