/**
 * User prompt template for generating follow-up emails
 */
export const FOLLOWUP_EMAIL_USER_PROMPT = (params: {
  tone: 'polite' | 'friendly' | 'professional';
  originalSubject: string;
  recipient: string;
  threadContext: string;
}) => `Generate a ${params.tone} follow-up email for this unanswered message:

Subject: ${params.originalSubject}
Recipient: ${params.recipient}
Original context: ${params.threadContext}

Requirements:
- Keep it under 100 words
- Reference the original message naturally
- Add value or provide a gentle reminder
- Include a clear call-to-action
- Professional but not pushy or desperate
- Don't sound impatient
- Use appropriate ${params.tone} tone

Return only the email body text, no subject line.`;
