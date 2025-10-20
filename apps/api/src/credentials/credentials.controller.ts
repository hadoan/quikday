import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  Delete,
} from '@nestjs/common';
import { CredentialService } from './credential.service';
import { KindeGuard } from '../auth/kinde.guard';
import { SessionGuard } from '../common/session.guard';
import { AuthService } from '../auth/auth.service';
import type { Request } from 'express';
import { Logger } from '@nestjs/common';

@Controller('credentials')
@UseGuards(KindeGuard, SessionGuard)
export class CredentialsController {
  private readonly logger = new Logger('CredentialsController');

  constructor(
    private credentialService: CredentialService,
    private authService: AuthService
  ) {}

  @Get()
  async listCredentials(
    @Req() req: Request,
    @Query('appId') appId?: string,
    @Query('owner') owner?: 'user' | 'team'
  ) {
    // Derive real user id from claims (provision user if needed)
    const claims: any = (req as any).user || {};
    const me = await this.authService.getOrProvisionUserAndWorkspace({
      sub: claims?.sub,
      email: claims?.email,
      name: claims?.name,
      given_name: claims?.given_name,
      family_name: claims?.family_name,
    });

    const userId = me.id;
    // while App slugs use hyphens (e.g. google-calendar). Convert underscores to hyphens to match DB.
    const originalAppId = appId;
    const normalizedAppId = typeof appId === 'string' ? appId.replace(/_/g, '-') : appId;
    // team resolution not implemented yet; default to undefined
    const filter: any = {};
    if (normalizedAppId) filter.appId = normalizedAppId;
    if (owner === 'user') filter.userId = userId;

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

  @Delete(':id')
  async deleteCredential(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const claims: any = (req as any).user || {};
    const me = await this.authService.getOrProvisionUserAndWorkspace({
      sub: claims?.sub,
      email: claims?.email,
      name: claims?.name,
      given_name: claims?.given_name,
      family_name: claims?.family_name,
    });

    const userId = me.id;
    await this.credentialService.deleteCredential(userId, id);

    return {
      success: true,
      message: 'Credential deleted',
    };
  }
}
