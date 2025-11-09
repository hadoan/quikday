import { 
  Controller, 
  Get, 
  Param, 
  ParseIntPipe, 
  UseGuards, 
  Req, 
  UnauthorizedException 
} from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { KindeGuard } from '../auth/kinde.guard.js';

@Controller('teams')
@UseGuards(KindeGuard)
export class TeamsController {
  constructor(private prisma: PrismaService) {}

  /**
   * Verify that the requesting user is a member of the team
   */
  private async verifyTeamMembership(teamId: number, userSub: string): Promise<void> {
    // Look up the user by their Kinde sub to get the numeric database ID
    const user = await this.prisma.user.findUnique({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException('User not found in database. Please ensure user sync completed.');
    }

    // Check if user is a member of this team
    const membership = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException('You do not have access to this team');
    }
  }

  @Get(':id/policies')
  async getPolicies(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const claims = req.user || {};
    const userId = claims.sub;
    
    if (!userId) {
      throw new UnauthorizedException('User ID not found in claims');
    }
    
    // Verify team membership before returning policies
    await this.verifyTeamMembership(id, userId);
    
    return this.prisma.policy.findMany({ where: { teamId: id } });
  }

  @Get(':id/integrations')
  async getIntegrations(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const claims = req.user || {};
    const userId = claims.sub;
    
    if (!userId) {
      throw new UnauthorizedException('User ID not found in claims');
    }
    
    // Verify team membership before returning integrations
    await this.verifyTeamMembership(id, userId);
    
    return this.prisma.integration.findMany({ where: { teamId: id } });
  }
}
