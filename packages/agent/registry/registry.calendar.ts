import type { ToolRegistry } from './registry.js';
import { ModuleRef } from '@nestjs/core';
import {
  calendarCreateEvent,
  calendarListEvents,
  calendarGetEvent,
  calendarFreeBusy,
  calendarUpdateEvent,
  calendarCancelEvent,
  calendarSuggestSlots,
  calendarCheckAvailability,
} from './tools/calendar.js';

export function registerCalendarTools(registry: ToolRegistry, moduleRef: ModuleRef) {
  registry.register(calendarCheckAvailability(moduleRef));
  registry.register(calendarCreateEvent(moduleRef));
  registry.register(calendarListEvents(moduleRef));
  registry.register(calendarGetEvent(moduleRef));
  registry.register(calendarFreeBusy(moduleRef));
  registry.register(calendarUpdateEvent(moduleRef));
  registry.register(calendarCancelEvent(moduleRef));
  registry.register(calendarSuggestSlots(moduleRef));
}
