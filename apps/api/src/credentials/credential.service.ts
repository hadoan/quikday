import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CredentialMissingError, CredentialInvalidError } from '@quikday/types';
import { TelemetryService } from '../telemetry/telemetry.service';

export interface CredentialResolutionContext {
  userId: number;
  teamId: number | null;
  appId: string;
  credentialId?: number; // Explicit override
}

export interface ResolvedCredential {
  id: number;
  appId: string;
  type: string;
  key: any;
  userId: number | null;
  teamId: number | null;
  emailOrUserName: string | null;
  avatarUrl: string | null;
  name: string | null;
  resolvedVia: 'explicit' | 'userCurrent' | 'teamDefault' | 'userFallback' | 'teamFallback';
}

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService
  ) {}

  /**
   * Resolve a credential for a given app using the resolution policy:
   * 1. Explicit request override (credentialId)
   * 2. User current profile
   * 3. Team default (if available)
   * 4. Any valid credential for user
   * 5. Any valid credential for team
   */
  async resolveCredential(context: CredentialResolutionContext): Promise<ResolvedCredential> {
    const { userId, teamId, appId, credentialId } = context;

    // 1. Explicit override
    if (credentialId) {
      const credential = await this.prisma.credential.findFirst({
        where: {
          id: credentialId,
          appId,
          invalid: false,
          OR: [{ userId }, { teamId }],
        },
      });

      if (credential) {
        await this.trackResolution(appId, 'explicit', true);
        return this.mapCredential(credential, 'explicit');
      }

      this.logger.warn(
        `Explicit credential ${credentialId} not found or invalid for appId=${appId}`
      );
    }

    // 2. User current profile
    const userCurrent = await this.prisma.credential.findFirst({
      where: {
        userId,
        appId,
        isUserCurrentProfile: true,
        invalid: false,
      },
    });

    if (userCurrent) {
      await this.trackResolution(appId, 'userCurrent', true);
      return this.mapCredential(userCurrent, 'userCurrent');
    }

    // 3. Team default
    const teamDefault = await this.prisma.credential.findFirst({
      where: {
        teamId,
        appId,
        isTeamDefaultProfile: true,
        invalid: false,
      },
    });

    if (teamDefault) {
      await this.trackResolution(appId, 'teamDefault', true);
      return this.mapCredential(teamDefault, 'teamDefault');
    }

    // 4. Any valid user credential
    const userFallback = await this.prisma.credential.findFirst({
      where: {
        userId,
        appId,
        invalid: false,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (userFallback) {
      await this.trackResolution(appId, 'userFallback', true);
      return this.mapCredential(userFallback, 'userFallback');
    }

    // 5. Any valid team credential
    const teamFallback = await this.prisma.credential.findFirst({
      where: {
        teamId,
        appId,
        invalid: false,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (teamFallback) {
      await this.trackResolution(appId, 'teamFallback', true);
      return this.mapCredential(teamFallback, 'teamFallback');
    }

    // No credential found
    await this.trackResolution(appId, 'missing', false);
    throw new CredentialMissingError(appId, userId ? 'user' : 'team');
  }

  /**
   * Validate a credential and mark it invalid if necessary
   */
  async validateCredential(credentialId: number): Promise<boolean> {
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      return false;
    }

    if (credential.invalid) {
      return false;
    }

    // Check token expiration
    if (credential.tokenExpiresAt && credential.tokenExpiresAt < new Date()) {
      await this.markInvalid(credentialId, 'Token expired');
      return false;
    }

    return true;
  }

  /**
   * Mark a credential as invalid
   */
  async markInvalid(credentialId: number, reason?: string): Promise<void> {
    this.logger.warn(`Marking credential ${credentialId} as invalid: ${reason || 'unknown'}`);

    await this.prisma.credential.update({
      where: { id: credentialId },
      data: { invalid: true },
    });

    await this.telemetry.track('credential_marked_invalid', {
      credentialId,
      reason: reason || 'unknown',
    });
  }

  /**
   * Set a credential as the current profile for a user
   */
  async setUserCurrentProfile(userId: number, credentialId: number): Promise<void> {
    const credential = await this.prisma.credential.findFirst({
      where: { id: credentialId, userId },
    });

    if (!credential) {
      throw new Error('Credential not found or does not belong to user');
    }

    // Unset all other current profiles for this user and app
    await this.prisma.credential.updateMany({
      where: {
        userId,
        appId: credential.appId,
        id: { not: credentialId },
      },
      data: { isUserCurrentProfile: false },
    });

    // Set the new current profile
    await this.prisma.credential.update({
      where: { id: credentialId },
      data: { isUserCurrentProfile: true },
    });

    await this.telemetry.track('credential_current_profile_set', {
      userId,
      credentialId,
      appId: credential.appId,
    });
  }

  /**
   * Set a credential as the team default
   */
  async setTeamDefaultProfile(teamId: number, credentialId: number): Promise<void> {
    const credential = await this.prisma.credential.findFirst({
      where: { id: credentialId, teamId },
    });

    if (!credential) {
      throw new Error('Credential not found or does not belong to team');
    }

    // Unset all other defaults for this team and app
    await this.prisma.credential.updateMany({
      where: {
        teamId,
        appId: credential.appId,
        id: { not: credentialId },
      },
      data: { isTeamDefaultProfile: false },
    });

    // Set the new default
    await this.prisma.credential.update({
      where: { id: credentialId },
      data: { isTeamDefaultProfile: true },
    });

    await this.telemetry.track('credential_team_default_set', {
      teamId,
      credentialId,
      appId: credential.appId,
    });
  }

  /**
   * List credentials for a user or team
   */
  async listCredentials(filter: {
    userId?: number;
    teamId?: number;
    appId?: string;
  }): Promise<any[]> {
    return this.prisma.credential.findMany({
      where: {
        userId: filter.userId,
        teamId: filter.teamId,
        appId: filter.appId,
      },
      select: {
        id: true,
        appId: true,
        type: true,
        invalid: true,
        emailOrUserName: true,
        avatarUrl: true,
        name: true,
        isUserCurrentProfile: true,
        isTeamDefaultProfile: true,
        lastValidatedAt: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  /**
   * Delete a credential owned by a user (and perform app-specific cleanup).
   */
  async deleteCredential(userId: number, credentialId: number): Promise<void> {
    const credential = await this.prisma.credential.findFirst({
      where: { id: credentialId, userId },
      select: { id: true, appId: true },
    });

    if (!credential) {
      throw new Error('Credential not found or does not belong to user');
    }

    // App-specific cleanup: e.g., for zapier remove ApiKeys and webhooks
    if (credential.appId === 'zapier') {
      await this.prisma.apiKey.deleteMany({
        where: { userId, appId: 'zapier' },
      });
      // Note: If your project defines webhook or pageInfo models, add cleanup here.
    }

    await this.prisma.credential.delete({ where: { id: credentialId } });
  }

  private mapCredential(
    credential: any,
    resolvedVia: ResolvedCredential['resolvedVia']
  ): ResolvedCredential {
    return {
      id: credential.id,
      appId: credential.appId,
      type: credential.type,
      key: credential.key,
      userId: credential.userId,
      teamId: credential.teamId,
      emailOrUserName: credential.emailOrUserName,
      avatarUrl: credential.avatarUrl,
      name: credential.name,
      resolvedVia,
    };
  }

  private async trackResolution(appId: string, via: string, success: boolean): Promise<void> {
    const eventName = success ? 'credential_resolve_succeeded' : 'credential_resolve_failed';
    await this.telemetry.track(eventName, {
      appId,
      via,
      owner: via.includes('user') ? 'user' : via.includes('team') ? 'team' : 'unknown',
    });
  }
}
