import { Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service.js';
import { PrismaModule } from '@quikday/prisma';
import { RedisModule, PubSubModule } from '@quikday/libs';

@Module({
  imports: [PrismaModule, PubSubModule],
  providers: [WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
