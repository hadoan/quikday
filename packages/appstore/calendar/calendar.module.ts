import { DynamicModule, Module } from '@nestjs/common';
import { CALENDAR_FACTORY, CALENDAR_REGISTRY } from './calendar.tokens.js';
import { CalendarFactory } from './calendar.factory.js';

@Module({})
export class CalendarModule {
  static register(providers: { registry: Map<any, any> }): DynamicModule {
    return {
      module: CalendarModule,
      providers: [
        { provide: CALENDAR_REGISTRY, useValue: providers.registry },
        { provide: CALENDAR_FACTORY, useClass: CalendarFactory },
      ],
      exports: [CALENDAR_FACTORY],
    };
  }
}

