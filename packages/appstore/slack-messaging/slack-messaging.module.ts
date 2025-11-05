import { Module } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';
import { SlackMessagingService } from './slack-messaging.service.js';

@Module({
  providers: [PrismaService, CurrentUserService, SlackMessagingService],
  exports: [SlackMessagingService],
})
export class SlackMessagingModule {}

