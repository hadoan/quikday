import { z } from 'zod';
import { tool } from '@langchain/core/tools';

// Tool 1: Calendar
// Make end optional and support durationMinutes to reduce friction.
const calendarSchema = z
  .object({
    title: z.string().describe("Event title, e.g., 'Check-in with Sara'"),
    start: z
      .string()
      .describe("ISO or HH:MM today, e.g., '2025-10-18T09:00' or '10:00'"),
    end: z
      .string()
      .optional()
      .describe("ISO or HH:MM today, e.g., '2025-10-18T09:30' or '10:30'"),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(480)
      .optional()
      .describe('If no end provided, duration in minutes (default 30).'),
    attendees: z.string().optional().describe('Comma-separated emails or names'),
    location: z.string().optional().describe('Room/URL/address'),
  })
  .describe(
    'Create/update a calendar event; if end is omitted, use durationMinutes (default 30).',
  );

function toIsoFromStartAndMaybeEnd(
  start: string,
  end?: string,
  durationMinutes?: number,
): { startIso: string; endIso: string } {
  // Parse HH:MM as today local, otherwise let Date parse ISO.
  const parse = (s: string): Date => {
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const [h, m] = s.split(':').map((x) => parseInt(x, 10));
      const d = new Date();
      d.setSeconds(0, 0);
      d.setHours(h, m, 0, 0);
      return d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const startDate = parse(start);
  let endDate: Date;
  if (end) {
    endDate = parse(end);
  } else {
    const dur = durationMinutes ?? 30;
    endDate = new Date(startDate.getTime() + dur * 60 * 1000);
  }

  return { startIso: startDate.toISOString(), endIso: endDate.toISOString() };
}

export const createCalendarEvent = tool(
  async (input: any) => {
    const { title, start, end, durationMinutes, attendees, location } = calendarSchema.parse(input);
    const { startIso, endIso } = toIsoFromStartAndMaybeEnd(start, end, durationMinutes);
    const withAtt = attendees ? ` with ${attendees}` : '';
    const where = location ? ` @ ${location}` : '';
    return `📅 Event '${title}' from ${startIso} to ${endIso}${withAtt}${where}.`;
  },
  {
    name: 'create_calendar_event',
    description:
      'Create/update a calendar event. If end omitted, default duration is 30 minutes.',
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
