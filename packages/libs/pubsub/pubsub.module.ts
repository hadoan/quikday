import { Module } from '@nestjs/common';
import { InMemoryEventBus } from './in-memory-event-bus.service.js';

@Module({
  providers: [{ provide: 'RunEventBus', useClass: InMemoryEventBus }],
  exports: [{ provide: 'RunEventBus', useClass: InMemoryEventBus }],
})
export class PubSubModule {}
