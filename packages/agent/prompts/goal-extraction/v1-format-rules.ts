/**
 * Format validation rules (v1)
 * How to handle dates, emails, and other data types
 * These can evolve but should be validated in CODE first
 */

export const FORMAT_RULES_V1 = [
  '**Format validation:**',
  '- For dates/times: use ISO 8601 format when provided',
  '- For emails: validate format when provided',
  '- For numbers: extract numeric values only',
  '- For arrays: use proper JSON array syntax',
  '- For select/multiselect: include an "options" string array of allowed values; do not set defaults',
  '',
  '**Template syntax extraction:**',
  '- Users may provide inline defaults using {key=value} syntax (e.g., "{minutes=10}", "{max=8}")',
  '- Extract these into the "provided" object with the parsed value',
  '- Example: "Give me a {minutes=10}-minute triage" → provided: { "time_window_minutes": 10, "minutes": 10 }',
  '- Example: "create drafts (max {max=8})" → provided: { "max_results": 8, "max": 8 }',
  '- Strip the template syntax from the outcome description',
].join('\n');
