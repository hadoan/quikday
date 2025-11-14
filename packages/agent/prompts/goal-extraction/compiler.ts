/**
 * Prompt Compiler/Composer
 * Assembles runtime prompts from modular components
 * Only includes what's needed based on context
 */

import { GOAL_EXTRACTION_CORE_V1 } from './v1-core-contract.js';
import { FORMAT_RULES_V1 } from './v1-format-rules.js';
import { INTEGRATION_POLICY_V1 } from './v1-integration-policy.js';
import { GOAL_EXTRACTION_EXAMPLES_V1 } from './v1-examples.js';

// Domain-specific rules
import { EMAIL_DOMAIN_RULES_V1 } from './domains/email-v1.js';
import { CALENDAR_DOMAIN_RULES_V1 } from './domains/calendar-v1.js';
import { SOCIAL_DOMAIN_RULES_V1 } from './domains/social-v1.js';
import { MESSAGING_DOMAIN_RULES_V1 } from './domains/messaging-v1.js';

export interface PromptCompilerOptions {
  /** Connected app slugs (e.g., ['gmail', 'google-calendar', 'slack']) */
  connectedApps?: string[];

  /** Detected domains in user prompt (e.g., ['email', 'calendar']) */
  domains?: string[];

  /** Include examples for few-shot learning */
  includeExamples?: boolean;

  /** Version to use (defaults to v1) */
  version?: 'v1';
}

/**
 * Compile a goal extraction system prompt from modular components
 * Only includes relevant domain rules based on context
 */
export function compileGoalExtractionPrompt(options: PromptCompilerOptions = {}): string {
  const { connectedApps = [], domains = [], includeExamples = true, version = 'v1' } = options;

  const parts: string[] = [];

  // Always include core contract
  parts.push(GOAL_EXTRACTION_CORE_V1);

  // Always include format rules
  parts.push('', FORMAT_RULES_V1);

  // Include integration policy if user has connected apps
  if (connectedApps.length > 0) {
    parts.push('', INTEGRATION_POLICY_V1);
  }

  // Include domain-specific rules only if relevant
  const domainRules = getDomainRules(domains);
  if (domainRules.length > 0) {
    parts.push('', '**Domain-specific guidance:**');
    parts.push(...domainRules);
  }

  // Include examples for few-shot learning
  if (includeExamples) {
    parts.push('', GOAL_EXTRACTION_EXAMPLES_V1);
  }

  return parts.join('\n');
}

/**
 * Get domain-specific rules based on detected domains
 */
function getDomainRules(domains: string[]): string[] {
  const rules: string[] = [];

  const domainMap: Record<string, string> = {
    email: EMAIL_DOMAIN_RULES_V1,
    calendar: CALENDAR_DOMAIN_RULES_V1,
    social: SOCIAL_DOMAIN_RULES_V1,
    messaging: MESSAGING_DOMAIN_RULES_V1,
  };

  for (const domain of domains) {
    const rule = domainMap[domain];
    if (rule) {
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * Build user prompt for goal extraction
 */
export function compileGoalUserPrompt(
  userInput: string,
  answers: Record<string, unknown>,
  meta: {
    timezone: string;
    todayISO: string;
    user?: { id?: string; name?: string; email?: string };
  },
): string {
  const parts = [
    '**User request:**',
    userInput,
    '',
    '**System metadata (for interpreting relative references only; do NOT mirror it in the extracted context unless the user explicitly mentions it):**',
    `- Current time: ${meta.todayISO}`,
    `- Timezone: ${meta.timezone}`,
    ...(meta.user?.name || meta.user?.email || meta.user?.id
      ? [
          `- Requesting user: ${
            [meta.user?.name, meta.user?.email]
              .filter((v) => typeof v === 'string' && v.trim().length > 0)
              .join(' <') + (meta.user?.email ? '>' : '') ||
            meta.user?.id ||
            'unknown'
          }`,
        ]
      : []),
  ];

  if (Object.keys(answers).length > 0) {
    parts.push(
      '',
      '**Previously provided answers (only reuse if user references them):**',
      JSON.stringify(answers, null, 2),
    );
  }

  parts.push('', '**Task:** Extract the goal and context from this request. Output JSON only.');

  return parts.join('\n');
}

/**
 * Detect domains from user input
 * Simple keyword-based detection (can be enhanced with ML)
 */
export function detectDomains(userInput: string): string[] {
  const input = userInput.toLowerCase();
  const domains: string[] = [];

  // Email keywords
  if (/email|draft|send|reply|inbox|triage|follow.?up/.test(input)) {
    domains.push('email');
  }

  // Calendar keywords
  if (/schedule|meeting|call|calendar|event|appointment|book/.test(input)) {
    domains.push('calendar');
  }

  // Social keywords
  if (/post|tweet|linkedin|twitter|social|publish/.test(input)) {
    domains.push('social');
  }

  // Messaging keywords
  if (/slack|teams|message|chat|dm|channel/.test(input)) {
    domains.push('messaging');
  }

  return [...new Set(domains)]; // Deduplicate
}
