/**
 * Email domain rules (v1)
 * Specific guidance for email-related goals
 */

export const EMAIL_DOMAIN_RULES_V1 = [
  '**Email operations:**',
  '- For email triage/filtering: may involve time_window_minutes, max_results, priority_criteria (keywords, senders, urgency markers)',
  '- For draft creation: may involve reply_tone (tone of voice), max_length, context_requirements',
  '- For sending emails: recipients should be captured if provided (to/cc/bcc)',
  '- Email addresses should be validated in format (regex in code will enforce)',
  '- Common field names: time_window_minutes (numeric), max_results (numeric), priority_criteria (text), reply_tone (select)',
].join('\n');
