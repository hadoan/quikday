import { Module } from '@nestjs/common';
import { RedisPubSubService } from './redis-pubsub.service.js';

@Module({
  providers: [RedisPubSubService],
  exports: [RedisPubSubService],
})
export class RedisModule {}
