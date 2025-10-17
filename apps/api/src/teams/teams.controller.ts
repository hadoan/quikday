import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PrismaService } from '@runfast/prisma';
import { KindeGuard } from '../auth/kinde.guard';

@Controller('teams')
@UseGuards(KindeGuard)
export class TeamsController {
  constructor(private prisma: PrismaService) {}

  @Get(':id/policies')
  getPolicies(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.policy.findMany({ where: { teamId: id } });
  }

  @Get(':id/integrations')
  getIntegrations(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.integration.findMany({ where: { teamId: id } });
  }
}
