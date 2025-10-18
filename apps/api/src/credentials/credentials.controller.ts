import { Body, Controller, Get, Param, Post, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { CredentialService } from './credential.service';
import { KindeGuard } from '../auth/kinde.guard';
import { SessionGuard } from '../common/session.guard';

@Controller('credentials')
@UseGuards(KindeGuard, SessionGuard)
export class CredentialsController {
  constructor(private credentialService: CredentialService) {}

  @Get()
  async listCredentials(
    @Query('appId') appId?: string,
    @Query('owner') owner?: 'user' | 'team'
  ) {
    // TODO: Extract userId and teamId from auth context via decorator
    const userId = 1; // Placeholder
    const teamId = 1; // Placeholder

    const filter: any = {};
    if (appId) filter.appId = appId;
    if (owner === 'user') filter.userId = userId;
    if (owner === 'team') filter.teamId = teamId;

    const credentials = await this.credentialService.listCredentials(filter);

    return {
      success: true,
      data: credentials,
    };
  }

  @Post(':id/select-current')
  async selectCurrent(@Param('id', ParseIntPipe) id: number) {
    // TODO: Extract userId from auth context
    const userId = 1; // Placeholder

    await this.credentialService.setUserCurrentProfile(userId, id);

    return {
      success: true,
      message: 'Credential set as current profile',
    };
  }

  @Post(':id/set-team-default')
  async setTeamDefault(@Param('id', ParseIntPipe) id: number) {
    // TODO: Extract teamId from auth context
    const teamId = 1; // Placeholder

    await this.credentialService.setTeamDefaultProfile(teamId, id);

    return {
      success: true,
      message: 'Credential set as team default',
    };
  }

  @Post(':id/validate')
  async validateCredential(@Param('id', ParseIntPipe) id: number) {
    const isValid = await this.credentialService.validateCredential(id);

    return {
      success: true,
      data: { isValid },
    };
  }
}
