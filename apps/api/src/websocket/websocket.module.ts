import { Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { PrismaModule } from '@quikday/prisma';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
