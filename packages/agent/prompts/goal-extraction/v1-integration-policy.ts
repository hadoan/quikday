/**
 * Integration policy rules (v1)
 * What user data is already available from connected apps
 */

export const INTEGRATION_POLICY_V1 = [
  '**Important: Connected Integrations**',
  '- The user has connected integrations (Gmail, Calendar, Slack, etc.)',
  '- Email account, calendar settings, and platform credentials are ALREADY available from connected integrations',
  '- DO NOT extract "email_account", "which email", or similar fields for email operations',
  '- DO NOT extract platform credentials that are stored in connected apps',
  '- Focus on extracting explicit user-provided information (like content, recipients, specific dates)',
].join('\n');
