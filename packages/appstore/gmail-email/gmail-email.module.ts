import { Module } from '@nestjs/common';
import { GmailEmailService } from './gmail-email.service.js';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

@Module({
  providers: [GmailEmailService, PrismaService, CurrentUserService],
  exports: [GmailEmailService],
})
export class GmailEmailModule {}
