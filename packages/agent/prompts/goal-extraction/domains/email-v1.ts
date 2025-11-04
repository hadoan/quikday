/**
 * Email domain rules (v1)
 * Specific guidance for email-related goals
 */

export const EMAIL_DOMAIN_RULES_V1 = [
  '**Email operations:**',
  '- For email triage/filtering: may need priority_criteria (keywords, senders, urgency markers)',
  '- For draft creation: may need reply_tone (tone of voice), max_length, context_requirements',
  "- If 'reply_tone' is missing, set type to 'select' and include options: ['Neutral','Friendly','Formal','Concise','Empathetic']",
  '- For sending emails: MUST have recipients (to/cc/bcc)',
  '- Email addresses should be validated in format (regex in code will enforce)',
  '- Mark optional fields with "required": false and provide sensible defaults when possible',
].join('\n');
