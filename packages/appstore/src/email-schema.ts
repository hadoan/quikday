/**
 * Base email tool schema and types
 * Can be extended by specific email providers (Gmail, Outlook, etc.)
 */
import { z } from 'zod';

/**
 * Standard email schema
 * Used across all email integrations
 */
export const baseEmailSchema = z
  .object({
    to: z.string().describe('Recipient email address or comma-separated list of addresses'),
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Email body content (plain text or HTML)'),
    cc: z.string().optional().describe('CC recipients (comma-separated email addresses)'),
    bcc: z.string().optional().describe('BCC recipients (comma-separated email addresses)'),
    attachments: z.string().optional().describe('Comma-separated file paths or URLs to attach'),
    isHtml: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether the body is HTML (default: false for plain text)'),
    replyTo: z.string().optional().describe('Reply-to email address'),
  })
  .describe('Send an email with optional CC, BCC, and attachments.');

export type BaseEmail = z.infer<typeof baseEmailSchema>;

/**
 * Email send response format
 */
export interface EmailSendResponse {
  success: boolean;
  message: string;
  messageId?: string;
  to?: string[];
  subject?: string;
}

/**
 * Parse comma-separated email addresses
 */
export function parseEmailAddresses(addresses?: string): string[] {
  if (!addresses) return [];
  return addresses
    .split(',')
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate multiple email addresses
 */
export function validateEmailAddresses(addresses: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const addr of addresses) {
    if (isValidEmail(addr)) {
      valid.push(addr);
    } else {
      invalid.push(addr);
    }
  }

  return { valid, invalid };
}
