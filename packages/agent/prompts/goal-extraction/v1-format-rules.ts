/**
 * Format validation rules (v1)
 * How to handle dates, emails, and other data types
 * These can evolve but should be validated in CODE first
 */

export const FORMAT_RULES_V1 = [
  '**Format validation:**',
  '- For dates/times: use ISO 8601 format or mark as missing',
  '- For emails: validate format or mark as missing',
  '- For numbers: extract numeric values only',
  '- For arrays: use proper JSON array syntax',
].join('\n');
