import { Inject, Injectable, Logger } from '@nestjs/common';
import { CALENDAR_REGISTRY } from './calendar.tokens.js';
import type { CalendarService } from './calendar.service.js';
import type { CalendarProviderId } from './calendar.types.js';
import { CurrentUserService } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';

export type CalendarCtor = new (
  currentUser: CurrentUserService,
  prisma: PrismaService,
) => CalendarService;

export interface CalendarFactoryDeps {
  currentUser: CurrentUserService;
  prisma: PrismaService;
}

@Injectable()
export class CalendarFactory {
  private logger = new Logger(CalendarFactory.name);
  constructor(
    @Inject(CALENDAR_REGISTRY) private readonly registry: Map<CalendarProviderId, CalendarCtor>,
  ) {}

  create(provider: CalendarProviderId, deps: CalendarFactoryDeps): CalendarService {
    const Ctor = this.registry.get(provider);
    if (!Ctor) {
      this.logger.error(`No CalendarService registered for provider=${provider}`);
      throw new Error(`Unsupported calendar provider: ${provider}`);
    }
    return new Ctor(deps.currentUser, deps.prisma);
  }
}
