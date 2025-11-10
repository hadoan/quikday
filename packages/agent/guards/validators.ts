import { z } from 'zod';

/**
 * Validation functions for common data types
 * Enforces format rules in CODE instead of prose
 */

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validate email address format
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  if (!EMAIL_REGEX.test(email.trim())) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true };
}

/**
 * Validate and normalize datetime
 * Accepts ISO 8601 or relative dates
 */
export function validateDateTime(
  input: string,
  timezone: string = 'UTC',
): {
  valid: boolean;
  iso?: string;
  error?: string;
  needsClarification?: boolean;
} {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'DateTime is required' };
  }

  // Try parsing as ISO 8601 first
  try {
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return { valid: true, iso: date.toISOString() };
    }
  } catch (e) {
    // Continue to relative date parsing
  }

  // Relative dates like "tomorrow", "next week", etc. need clarification
  const relativePatterns =
    /tomorrow|today|next\s+week|next\s+month|in\s+\d+\s+(days?|hours?|minutes?)/i;
  if (relativePatterns.test(input)) {
    return {
      valid: false,
      needsClarification: true,
      error: `Relative time "${input}" needs to be converted to specific datetime`,
    };
  }

  return { valid: false, error: `Cannot parse datetime: ${input}` };
}

/**
 * Validate duration in minutes
 */
export function validateDuration(input: unknown): {
  valid: boolean;
  minutes?: number;
  error?: string;
} {
  if (typeof input === 'number') {
    if (input > 0 && input <= 1440) {
      // Max 24 hours
      return { valid: true, minutes: input };
    }
    return { valid: false, error: 'Duration must be between 1 and 1440 minutes' };
  }

  if (typeof input === 'string') {
    const parsed = parseInt(input, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 1440) {
      return { valid: true, minutes: parsed };
    }

    // Try parsing natural language like "30 minutes", "1 hour"
    const hourMatch = input.match(/(\d+)\s*hours?/i);
    if (hourMatch) {
      const hours = parseInt(hourMatch[1], 10);
      return { valid: true, minutes: hours * 60 };
    }

    const minMatch = input.match(/(\d+)\s*min(utes?)?/i);
    if (minMatch) {
      const mins = parseInt(minMatch[1], 10);
      return { valid: true, minutes: mins };
    }
  }

  return { valid: false, error: 'Invalid duration format' };
}

/**
 * Enforce integration policy
 * Filters out questions that should NOT be asked because we have the data from integrations
 */
export function filterIntegrationPolicyQuestions(
  missing: Array<{ key: string; question: string; type?: string; required?: boolean }>,
  connectedApps: string[],
): Array<{ key: string; question: string; type?: string; required?: boolean }> {
  const forbiddenKeys = new Set<string>();

  // If email is connected, don't ask for email account
  if (connectedApps.includes('gmail') || connectedApps.includes('email')) {
    forbiddenKeys.add('email_account');
    forbiddenKeys.add('sender_email');
    forbiddenKeys.add('from_email');
  }

  // If calendar is connected, don't ask for calendar settings
  if (connectedApps.includes('google-calendar') || connectedApps.includes('calendar')) {
    forbiddenKeys.add('calendar_id');
    forbiddenKeys.add('which_calendar');
  }

  // If Slack is connected, don't ask for workspace credentials
  if (connectedApps.includes('slack')) {
    forbiddenKeys.add('slack_workspace');
    forbiddenKeys.add('slack_token');
  }

  // Filter out forbidden questions
  return missing.filter((item) => {
    const keyLower = item.key.toLowerCase();
    return !Array.from(forbiddenKeys).some((forbidden) =>
      keyLower.includes(forbidden.toLowerCase()),
    );
  });
}

/**
 * Repair common LLM output issues
 * Cleans up JSON that might have markdown fences or other artifacts
 */
export function repairJsonOutput(raw: string): string {
  // Remove markdown code fences
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  // Find the actual JSON object
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');

  if (first >= 0 && last > first) {
    return cleaned.slice(first, last + 1);
  }

  return cleaned;
}

/**
 * Schema for missing field validation
 */
export const MissingFieldSchema = z.object({
  key: z.string().min(1),
  question: z.string().min(1),
  type: z.enum(['string', 'email', 'datetime', 'number', 'select', 'text']).optional(),
  required: z.boolean().optional().default(true),
  options: z.array(z.string()).optional(),
});

export type MissingField = z.infer<typeof MissingFieldSchema>;
