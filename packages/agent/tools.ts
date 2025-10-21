import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Type definitions for context injection
export interface ToolExecutionContext {
  userId: number;
  credentialKey?: string;
}

// Global context that will be injected by RunProcessor
let toolExecutionContext: ToolExecutionContext | null = null;

export function setToolExecutionContext(context: ToolExecutionContext | null) {
  toolExecutionContext = context;
}

export function getToolExecutionContext(): ToolExecutionContext | null {
  return toolExecutionContext;
}

/**
 * Define the Google Calendar tool
 */
export const createCalendarEvent = tool(
  async (input: any) => {
    const context = getToolExecutionContext();

    if (!context) {
      // In PLAN mode or when context not available, return placeholder
      return `[PLANNED] Will create calendar event: ${input.title} at ${input.start}`;
    }

    // Execute the real tool with userId context
    try {
      const { createGoogleCalendarEvent } = await import('@quikday/appstore-google-calendar');
      const result = await createGoogleCalendarEvent(input, context.userId);
      return result;
    } catch (error) {
      throw new Error(
        `Failed to create calendar event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
  {
    name: 'create_google_calendar_event',
    description:
      'Create a calendar event in Google Calendar. Use this when the user wants to schedule or create an event. Requires: title, start (ISO string). Optional: end (ISO string), durationMinutes (default 30), description, location, attendees (comma-separated emails).',
    schema: z.object({
      title: z.string().describe("Event title, e.g., 'Check-in with Sara'"),
      start: z.string().describe("Start time in ISO 8601 format, e.g., '2025-10-22T16:00:00'"),
      end: z
        .string()
        .optional()
        .describe("End time in ISO 8601 format, e.g., '2025-10-22T16:30:00'"),
      durationMinutes: z
        .number()
        .int()
        .positive()
        .max(480)
        .optional()
        .describe('If no end provided, duration in minutes (default 30)'),
      attendees: z.string().optional().describe('Comma-separated email addresses'),
      location: z.string().optional().describe('Event location or meeting URL'),
      description: z.string().optional().describe('Event description or notes'),
    }),
  },
);

/**
 * Define the Gmail tool
 */
export const sendEmail = tool(
  async (input: any) => {
    const context = getToolExecutionContext();

    if (!context) {
      // In PLAN mode or when context not available, return placeholder
      return `[PLANNED] Will send email to: ${input.to} with subject: ${input.subject}`;
    }

    // Execute the real tool with userId context
    try {
      const { sendGmailEmail } = await import('@quikday/appstore-gmail-email');
      const result = await sendGmailEmail(input, context.userId);
      return result;
    } catch (error) {
      throw new Error(
        `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
  {
    name: 'send_gmail_email',
    description:
      'Send an email via Gmail. Use this when the user wants to send an email or message someone. Requires: to (email address), subject, body. Optional: cc, bcc.',
    schema: z.object({
      to: z.string().describe('Recipient email address'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body content'),
      cc: z.string().optional().describe('CC email address'),
      bcc: z.string().optional().describe('BCC email address'),
    }),
  },
);

/**
 * Define the Slack DM tool (placeholder for future)
 */
const slackSchema = z.object({
  to: z.string().describe('Slack handle or email'),
  message: z.string().describe('Message body'),
});

export const sendSlackDm = tool(
  async (input: any) => {
    const { to, message } = slackSchema.parse(input);
    return `\ud83d\udcac DM to ${to}: ${message}`;
  },
  {
    name: 'send_slack_dm',
    description:
      'Send an asynchronous direct message to one Slack recipient. Return a delivery receipt.',
    schema: slackSchema,
  },
);

export const tools = [createCalendarEvent, sendEmail, sendSlackDm];
