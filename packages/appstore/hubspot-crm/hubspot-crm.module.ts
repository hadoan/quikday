import { Module } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { HubspotCrmService } from './hubspot-crm.service.js';

@Module({
  providers: [PrismaService, HubspotCrmService],
  exports: [HubspotCrmService],
})
export class HubspotCrmModule {}

