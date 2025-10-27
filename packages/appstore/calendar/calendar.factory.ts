import { Inject, Injectable, Logger } from '@nestjs/common';
import { CALENDAR_REGISTRY } from './calendar.tokens.js';
import type { CalendarService } from './calendar.service.js';
import type { CalendarProviderId } from './calendar.types.js';

export type CalendarCtor = new (...args: any[]) => CalendarService;

export interface CalendarConnection {
  id: string; // connectionId
  provider: CalendarProviderId; // 'google' | 'outlook'
  accessToken?: string;
  refreshToken?: string;
  tenantId?: string; // for Outlook
  meta?: Record<string, any>;
}

@Injectable()
export class CalendarFactory {
  private logger = new Logger(CalendarFactory.name);
  constructor(@Inject(CALENDAR_REGISTRY) private readonly registry: Map<CalendarProviderId, CalendarCtor>) {}

  createFromConnection(conn: CalendarConnection): CalendarService {
    const Ctor = this.registry.get(conn.provider);
    if (!Ctor) {
      this.logger.error(`No CalendarService registered for provider=${conn.provider}`);
      throw new Error(`Unsupported calendar provider: ${conn.provider}`);
    }
    return new Ctor(conn);
  }
}

