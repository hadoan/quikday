import { z } from 'zod';
import { tool } from '@langchain/core/tools';

// Tool 1: Calendar
const calendarSchema = z.object({
  title: z.string().describe("Event title, e.g., 'Check-in with Sara'"),
  start: z.string().describe("ISO or HH:MM today, e.g., '2025-10-18T09:00' or '10:00'"),
  end: z.string().describe("ISO or HH:MM today, e.g., '2025-10-18T09:30' or '10:30'"),
  attendees: z.string().optional().describe('Comma-separated emails or names'),
  location: z.string().optional().describe('Room/URL/address'),
});

export const createCalendarEvent = tool(
  async (input: any) => {
    const { title, start, end, attendees, location } = calendarSchema.parse(input);
    const withAtt = attendees ? ` with ${attendees}` : '';
    const where = location ? ` @ ${location}` : '';
    return `📅 Event '${title}' from ${start} to ${end}${withAtt}${where}.`;
  },
  {
    name: 'create_calendar_event',
    description:
      'Create or update a time-boxed calendar event (title, start/end, attendees, location). Return a confirmation string.',
    schema: calendarSchema,
  },
);
// Tool 2: Slack DM
const slackSchema = z.object({
  to: z.string().describe('Slack handle or email'),
  message: z.string().describe('Message body'),
});

export const sendSlackDm = tool(
  async (input: any) => {
    const { to, message } = slackSchema.parse(input);
    return `💬 DM to ${to}: ${message}`;
  },
  {
    name: 'send_slack_dm',
    description:
      'Send an asynchronous direct message to one Slack recipient. Return a delivery receipt.',
    schema: slackSchema,
  },
);

export const tools = [createCalendarEvent, sendSlackDm];
