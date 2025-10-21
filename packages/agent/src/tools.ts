import { z } from 'zod';
import { tool } from '@langchain/core/tools';

// Import from google-calendar package
import {
  createGoogleCalendarEvent,
  googleCalendarToolMetadata,
} from '@quikday/appstore-google-calendar';

// Import from gmail-email package
import {
  sendGmailEmail,
  gmailToolMetadata,
} from '@quikday/appstore-gmail-email';

// Tool 1: Google Calendar
// Using implementation from google-calendar package
export const createCalendarEvent = tool(
  async (input: any) => {
    return await createGoogleCalendarEvent(input);
  },
  {
    name: googleCalendarToolMetadata.name,
    description: googleCalendarToolMetadata.description,
    schema: googleCalendarToolMetadata.schema,
  },
);

// Tool 2: Gmail Email
// Using implementation from gmail-email package
export const sendEmail = tool(
  async (input: any) => {
    return await sendGmailEmail(input);
  },
  {
    name: gmailToolMetadata.name,
    description: gmailToolMetadata.description,
    schema: gmailToolMetadata.schema,
  },
);

// Tool 3: Slack DM
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

export const tools = [createCalendarEvent, sendEmail, sendSlackDm];
