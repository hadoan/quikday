import { Module } from '@nestjs/common';
import { GoogleCalendarProviderService } from './google-calendar.service.js';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

@Module({
  providers: [GoogleCalendarProviderService, PrismaService, CurrentUserService],
  exports: [GoogleCalendarProviderService],
})
export class GoogleCalendarModule {}
