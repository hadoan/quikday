import { Module } from '@nestjs/common';
import { Office365CalendarProviderService } from './office365-calendar.service.js';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

@Module({
  providers: [Office365CalendarProviderService, PrismaService, CurrentUserService],
  exports: [Office365CalendarProviderService],
})
export class Office365CalendarModule {}
