import { Module } from '@nestjs/common';
import { ExchangeCalendarProviderService } from './exchange-calendar.service.js';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

@Module({
  providers: [ExchangeCalendarProviderService, PrismaService, CurrentUserService],
  exports: [ExchangeCalendarProviderService],
})
export class ExchangeCalendarModule {}
