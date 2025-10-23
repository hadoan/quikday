import { Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { PrismaModule } from '@quikday/prisma';
import { RedisModule, PubSubModule } from '@quikday/libs';

@Module({
  imports: [PrismaModule, RedisModule, PubSubModule],
  providers: [WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
