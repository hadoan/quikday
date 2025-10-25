/**
 * Base calendar utilities for parsing dates and times
 * Used by calendar integrations (Google Calendar, Outlook, etc.)
 */

export interface CalendarEventTime {
  startIso: string;
  endIso: string;
}

export interface ParseDateOptions {
  defaultDurationMinutes?: number;
}

/**
 * Parse a date string that can be:
 * - ISO format: '2025-10-18T09:00:00Z'
 * - Local time: '10:00' or '9:00' (treated as today)
 * - Date string: '2025-10-18'
 */
export function parseFlexibleDate(dateStr: string): Date {
  // Check if it's a time-only format (HH:MM or H:MM)
  if (/^\d{1,2}:\d{2}$/.test(dateStr)) {
    const [h, m] = dateStr.split(':').map((x) => parseInt(x, 10));
    const d = new Date();
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    return d;
  }

  // Otherwise, try to parse as ISO or standard date
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Fallback to current time if invalid
    console.warn(`Invalid date string: ${dateStr}, falling back to now`);
    return new Date();
  }
  return d;
}

/**
 * Convert start and optional end times to ISO strings
 * If end is not provided, calculates it from durationMinutes
 */
export function toIsoFromStartAndMaybeEnd(
  start: string,
  end?: string,
  durationMinutes?: number,
  options: ParseDateOptions = {},
): CalendarEventTime {
  const defaultDuration = options.defaultDurationMinutes ?? 30;

  const startDate = parseFlexibleDate(start);
  let endDate: Date;

  if (end) {
    endDate = parseFlexibleDate(end);
  } else {
    const dur = durationMinutes ?? defaultDuration;
    endDate = new Date(startDate.getTime() + dur * 60 * 1000);
  }

  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
  };
}

/**
 * Format a date range for display
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const startStr = start.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const endStr = end.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${startStr} - ${endStr}`;
}

/**
 * Validate that end time is after start time
 */
export function validateDateRange(startIso: string, endIso: string): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return end.getTime() > start.getTime();
}

