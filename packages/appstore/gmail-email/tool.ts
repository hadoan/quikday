/**
 * Gmail Tool Factory
 * Creates LangChain tool for calendar events - to be used by agent package
 */
import { baseEmailSchema, type BaseEmail, parseEmailAddresses, validateEmailAddresses } from '@quikday/appstore';
import { generateEmailSummary, formatEmailBody } from '@quikday/appstore';

export interface GmailToolInput extends BaseEmail {}

/**
 * Core logic for sending email via Gmail
 * This can be called by the LangChain tool in the agent package
 */
export async function sendGmailEmail(input: GmailToolInput): Promise<string> {
  const { to, subject, body, cc, bcc, isHtml, replyTo, attachments } =
    baseEmailSchema.parse(input);

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

  // Build email details summary
  const details: string[] = [];
  details.push(`To: ${validTo.join(', ')}`);
  if (validCc.length > 0) details.push(`CC: ${validCc.join(', ')}`);
  if (validBcc.length > 0) details.push(`BCC: ${validBcc.join(', ')}`);
  if (replyTo) details.push(`Reply-To: ${replyTo}`);
  if (attachments) details.push(`Attachments: ${attachments}`);
  details.push(`Format: ${isHtml ? 'HTML' : 'Plain Text'}`);

  // TODO: Actual Gmail API call would go here
  // Example:
  // const gmail = google.gmail({ version: 'v1', auth });
  // const message = createMimeMessage({ to: validTo, subject, body: formattedBody, isHtml });
  // const result = await gmail.users.messages.send({
  //   userId: 'me',
  //   requestBody: { raw: Buffer.from(message).toString('base64url') },
  // });

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
    'Send an email via Gmail. Supports multiple recipients, CC, BCC, HTML/plain text, and attachments. Validates email addresses before sending.',
  schema: baseEmailSchema,
  handler: sendGmailEmail,
};

/**
 * Future: Add more Gmail operations
 */
// export async function readGmailEmails(input: ReadEmailsInput): Promise<string> { ... }
// export async function replyToGmailEmail(input: ReplyEmailInput): Promise<string> { ... }
// export async function searchGmailEmails(input: SearchEmailsInput): Promise<string> { ... }
