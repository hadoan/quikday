/**
 * Messaging domain rules (v1)
 * Specific guidance for Slack, Teams, etc.
 */

export const MESSAGING_DOMAIN_RULES_V1 = [
  '**Messaging operations:**',
  '- For Slack/Teams: need channel or recipient',
  '- Channel names should include # prefix for Slack',
  '- Direct messages need specific user identification',
  '- Message formatting (bold, links, etc.) is platform-specific',
].join('\n');
