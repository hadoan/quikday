import type { AvailabilityQuery, AvailabilityResult, CalendarEvent } from './calendar.types.js';

export interface CalendarService {
  readonly provider: 'google' | 'outlook';

  checkAvailability(query: AvailabilityQuery): Promise<AvailabilityResult>;

  createEvent(event: Omit<CalendarEvent, 'id'> & { notifyAttendees?: boolean }): Promise<{
    id: string;
    htmlLink?: string;
    start: Date;
    end: Date;
  }>;

  getEvent?(id: string): Promise<CalendarEvent | null>;
  updateEvent?(id: string, patch: Partial<CalendarEvent>): Promise<CalendarEvent>;
  deleteEvent?(id: string): Promise<void>;

  // Optional list method used by some tools
  listEvents?(args: {
    start: Date;
    end: Date;
    pageToken?: string;
    pageSize?: number;
  }): Promise<{ nextPageToken?: string; items: CalendarEvent[] }>;
}
