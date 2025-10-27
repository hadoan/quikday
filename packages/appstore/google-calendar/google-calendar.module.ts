import { Module } from '@nestjs/common';
import { GoogleCalendarProviderService } from './google-calendar.service.js';

@Module({
  providers: [GoogleCalendarProviderService],
  exports: [GoogleCalendarProviderService],
})
export class GoogleCalendarModule {}

