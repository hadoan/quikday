/**
 * Social media domain rules (v1)
 * Specific guidance for LinkedIn, Twitter/X, etc.
 */

export const SOCIAL_DOMAIN_RULES_V1 = [
  '**Social media posting:**',
  '- For content posting: may need content/message, platform_specific_options, scheduling_time',
  '- Platform must be specified (LinkedIn, Twitter, etc.)',
  '- Content length limits vary by platform (handled in code)',
  '- Hashtags and mentions should be preserved as-is from user input',
  '- Scheduling is optional; default is immediate posting',
].join('\n');
