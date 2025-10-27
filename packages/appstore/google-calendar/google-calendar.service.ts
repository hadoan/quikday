import { Injectable, Logger } from '@nestjs/common';
import type { CalendarService } from '@quikday/appstore/calendar/calendar.service';
import type { AvailabilityQuery, AvailabilityResult, CalendarEvent } from '@quikday/appstore/calendar/calendar.types';

@Injectable()
export class GoogleCalendarProviderService implements CalendarService {
  readonly provider = 'google' as const;
  private readonly logger = new Logger('GoogleCalendarProviderService');

  async checkAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    this.logger.log(this.format({ op: 'checkAvailability', query }));
    // Stub: Always available
    return {
      available: true,
      start: query.start,
      end: query.end,
      attendees: query.attendees,
    };
  }

  async createEvent(event: Omit<CalendarEvent, 'id'> & { notifyAttendees?: boolean }): Promise<{ id: string; htmlLink?: string; start: Date; end: Date; }>
  {
    this.logger.log(this.format({ op: 'createEvent', title: event.title, start: event.start, end: event.end }));
    // Stub: return a fake id and echo times
    const id = `gcal_${Math.random().toString(36).slice(2, 10)}`;
    return { id, start: event.start, end: event.end };
  }

  // Optional helper stubs
  async getEvent(id: string): Promise<CalendarEvent | null> {
    this.logger.log(this.format({ op: 'getEvent', id }));
    return null; // stub
  }

  private format(meta: Record<string, unknown>): string {
    try { return JSON.stringify(meta); } catch { return '[unserializable-meta]'; }
  }
}

