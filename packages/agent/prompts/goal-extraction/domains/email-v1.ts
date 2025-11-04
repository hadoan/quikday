/**
 * Email domain rules (v1)
 * Specific guidance for email-related goals
 */

export const EMAIL_DOMAIN_RULES_V1 = [
  '**Email operations:**',
  '- For email triage/filtering: may need priority_criteria (keywords, senders, urgency markers)',
  '- For draft creation: may need reply_tone (professional/casual/friendly), max_length, context_requirements',
  '- For sending emails: MUST have recipients (to/cc/bcc)',
  '- Email addresses should be validated in format (regex in code will enforce)',
  '- Mark optional fields with "required": false and provide sensible defaults when possible',
].join('\n');
