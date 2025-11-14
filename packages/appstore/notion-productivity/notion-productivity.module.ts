import { Module } from '@nestjs/common';
import { NotionProductivityService } from './notion-productivity.service.js';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

@Module({
  providers: [NotionProductivityService, PrismaService, CurrentUserService],
  exports: [NotionProductivityService],
})
export class NotionProductivityModule {}
