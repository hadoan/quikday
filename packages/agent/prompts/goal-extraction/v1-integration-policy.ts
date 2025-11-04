/**
 * Integration policy rules (v1)
 * What user data is already available from connected apps
 */

export const INTEGRATION_POLICY_V1 = [
  '**Important: Connected Integrations**',
  '- The user has connected integrations (Gmail, Calendar, Slack, etc.)',
  '- Email account, calendar settings, and platform credentials are ALREADY available from connected integrations',
  '- DO NOT ask for "email_account", "which email", or similar if the task involves email operations',
  '- DO NOT ask for platform credentials that are stored in connected apps',
  '- Only mark as "missing" information that the user must explicitly provide (like content, recipients, etc.)',
].join('\n');
