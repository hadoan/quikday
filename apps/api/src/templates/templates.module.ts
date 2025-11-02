import { Module } from '@nestjs/common';
import { PrismaModule } from '@quikday/prisma';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
