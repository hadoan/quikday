/**
 * User prompt template for generating follow-up emails
 */
export const FOLLOWUP_EMAIL_USER_PROMPT = (params: {
  tone: 'polite' | 'friendly' | 'professional';
  originalSubject: string;
  recipient: string;
  threadContext: string;
  senderName?: string;
  senderEmail?: string;
}) => `Generate a ${params.tone} follow-up email for this unanswered message:

Subject: ${params.originalSubject}
Recipient: ${params.recipient}
${params.senderName ? `Sender Name: ${params.senderName}` : ''}
${params.senderEmail ? `Sender Email: ${params.senderEmail}` : ''}
Original context: ${params.threadContext}

Requirements:
- Keep it under 100 words
- Write it as a reply to the prior email (not a new outreach)
- Reference the original message naturally
- Add value or provide a gentle reminder
- Include a clear call-to-action
- Professional but not pushy or desperate; don't sound impatient
- Use appropriate ${params.tone} tone
- If senderName is provided, end with a short sign-off (e.g., "Best,") and the exact sender name: "${params.senderName ?? ''}"; otherwise omit the signature
- Never use placeholder names like "[Your Name]" or "<Your Name>"

Return only the email body text (no subject line).`;
