/**
 * Gmail Tool Factory
 * Creates LangChain tool for Gmail email sending - to be used by agent package
 */
import { z } from 'zod';
import {
  baseEmailSchema,
  parseEmailAddresses,
  validateEmailAddresses,
  generateEmailSummary,
  formatEmailBody,
  textToHtml,
} from '@quikday/appstore';
import GmailManagerService from './gmail-manager.js';
import type { GmailSendEmailOptions } from './GmailSendEmailOptions.js';

const gmailEmailSchema = baseEmailSchema
  .extend({
    userId: z.number().int().positive().describe('Numeric user ID that owns the Gmail credential.'),
    fromName: z.string().optional().describe('Friendly display name for the From header.'),
    replyToThreadId: z
      .string()
      .optional()
      .describe('Optional Gmail thread ID used for conversation replies.'),
  })
  .describe('Send an email via Gmail on behalf of an authenticated user.');

export interface GmailToolInput extends z.infer<typeof gmailEmailSchema> {}

const gmailManager = new GmailManagerService();

/**
 * Core logic for sending email via Gmail
 * This can be called by the LangChain tool in the agent package
 */
export async function sendGmailEmail(input: GmailToolInput): Promise<string> {
  const {
    userId,
    to,
    subject,
    body,
    cc,
    bcc,
    isHtml,
    replyTo,
    attachments,
    fromName,
    replyToThreadId,
  } = gmailEmailSchema.parse(input);

  // Parse and validate email addresses
  const toAddresses = parseEmailAddresses(to);
  const ccAddresses = parseEmailAddresses(cc);
  const bccAddresses = parseEmailAddresses(bcc);

  const { valid: validTo, invalid: invalidTo } = validateEmailAddresses(toAddresses);
  const { valid: validCc, invalid: invalidCc } = validateEmailAddresses(ccAddresses);
  const { valid: validBcc, invalid: invalidBcc } = validateEmailAddresses(bccAddresses);

  // Report validation errors if any
  const allInvalid = [...invalidTo, ...invalidCc, ...invalidBcc];
  if (allInvalid.length > 0) {
    return `❌ Invalid email addresses found: ${allInvalid.join(', ')}`;
  }

  if (validTo.length === 0) {
    return '❌ No valid recipient addresses provided';
  }

  // Format body
  const formattedBody = formatEmailBody(body);
  const htmlBody = isHtml ? formattedBody : textToHtml(formattedBody);

  // Build email details summary
  const details: string[] = [];
  details.push(`To: ${validTo.join(', ')}`);
  if (validCc.length > 0) details.push(`CC: ${validCc.join(', ')}`);
  if (validBcc.length > 0) details.push(`BCC: ${validBcc.join(', ')}`);
  if (replyTo) details.push(`Reply-To: ${replyTo}`);
  if (attachments) details.push(`Attachments: ${attachments}`);
  details.push(`Format: ${isHtml ? 'HTML' : 'Plain Text'}`);

  const sendOptions: GmailSendEmailOptions = {
    to: validTo,
    cc: validCc.length > 0 ? validCc : undefined,
    bcc: validBcc.length > 0 ? validBcc : undefined,
    subject,
    htmlBody,
    fromName,
    replyToThreadId,
    replyTo: replyTo ?? undefined,
  };

  const sendResponse = await gmailManager.sendEmail(userId, sendOptions);
  if (!sendResponse.success) {
    return `❌ Failed to send email via Gmail: ${sendResponse.errorMessage ?? 'Unknown error'}`;
  }

  if (sendResponse.messageId) {
    details.push(`Message ID: ${sendResponse.messageId}`);
  }
  if (sendResponse.gmailUrl) {
    details.push(`Gmail URL: ${sendResponse.gmailUrl}`);
  }

  const preview = formattedBody.substring(0, 100);
  const summary = generateEmailSummary(validTo[0], subject, preview);

  return `${summary}\n\n${details.join('\n')}\n\n✅ Email sent via Gmail`;
}

/**
 * Tool metadata for agent registration
 */
export const gmailToolMetadata = {
  name: 'send_gmail_email',
  description:
    'Send an email via Gmail. Requires the numeric user ID tied to the stored Gmail credential. Supports multiple recipients, CC, BCC, HTML/plain text, and attachments.',
  schema: gmailEmailSchema,
  handler: sendGmailEmail,
};

/**
 * Future: Add more Gmail operations
 */
// export async function readGmailEmails(input: ReadEmailsInput): Promise<string> { ... }
// export async function replyToGmailEmail(input: ReplyEmailInput): Promise<string> { ... }
// export async function searchGmailEmails(input: SearchEmailsInput): Promise<string> { ... }
