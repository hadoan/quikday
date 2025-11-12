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
 * Robust JSON parser for LLM outputs
 * Handles common issues:
 * - Markdown code fences
 * - Control characters in strings (newlines, tabs, etc.)
 * - Extra prose before/after JSON
 * - Both objects and arrays
 *
 * @param raw - Raw LLM output that should contain JSON
 * @param context - Optional context for better error messages (e.g., "planner", "goal extraction")
 * @returns Parsed JSON object
 * @throws Error with detailed message if parsing fails
 */
export function parseRobustJson<T = any>(raw: string, context?: string): T {
  try {
    // Step 1: Extract and clean JSON
    const cleaned = extractAndCleanJson(raw);

    // Step 2: Fix control characters in strings
    const fixed = fixJsonControlCharacters(cleaned);

    // Step 3: Parse the JSON
    return JSON.parse(fixed) as T;
  } catch (err) {
    // Provide helpful error context
    const errorMsg = err instanceof Error ? err.message : String(err);
    const preview = raw.slice(0, 200);
    const contextStr = context ? ` [${context}]` : '';

    throw new Error(
      `Failed to parse LLM JSON output${contextStr}: ${errorMsg}\n` +
      `Preview: ${preview}${raw.length > 200 ? '...' : ''}`
    );
  }
}

/**
 * Extract JSON from LLM output that may contain markdown fences or prose
 * Handles both objects {...} and arrays [...]
 */
function extractAndCleanJson(output: string): string {
  let s = (output || '').trim();

  // Remove markdown code fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) s = fence[1].trim();

  // Check if it's an array or object
  const firstBracket = s.indexOf('[');
  const firstBrace = s.indexOf('{');

  // Determine if we're dealing with an array or object
  const isArray = firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace);

  if (isArray) {
    // Extract array
    const last = s.lastIndexOf(']');
    if (firstBracket >= 0 && last > firstBracket) {
      return s.slice(firstBracket, last + 1);
    }
  } else {
    // Extract object
    const last = s.lastIndexOf('}');
    if (firstBrace >= 0 && last > firstBrace) {
      return s.slice(firstBrace, last + 1);
    }
  }

  return s;
}

/**
 * Escapes control characters in JSON string values.
 * Handles literal newlines, tabs, carriage returns, etc. that are invalid in JSON.
 *
 * This is a stateful parser that tracks whether we're inside a string value or not.
 * Only control characters inside string values are escaped; structure is preserved.
 */
function fixJsonControlCharacters(json: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];

    if (escapeNext) {
      // Already escaped character, keep as-is
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      // Start of escape sequence
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      // Toggle string state
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      // Inside a string, escape control characters
      switch (char) {
        case '\n':
          result += '\\n';
          break;
        case '\r':
          result += '\\r';
          break;
        case '\t':
          result += '\\t';
          break;
        case '\b':
          result += '\\b';
          break;
        case '\f':
          result += '\\f';
          break;
        default:
          // Keep other characters as-is (including Unicode)
          result += char;
      }
    } else {
      // Outside string, keep as-is
      result += char;
    }
  }

  return result;
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
