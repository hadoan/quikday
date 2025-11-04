/**
 * Calendar domain rules (v1)
 * Specific guidance for calendar/scheduling goals
 */

export const CALENDAR_DOMAIN_RULES_V1 = [
  '**Calendar/scheduling operations:**',
  '- For scheduling: may need attendees, duration, preferred_times, meeting_title',
  '- Meeting duration should be in minutes (convert from natural language)',
  '- Attendees must be valid email addresses',
  '- Time zones matter: capture user\'s implied time zone or mark as missing',
  '- For availability checks: need time window and duration',
].join('\n');
