import { Injectable, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { getTeamPolicy, type TeamPolicy } from '@quikday/agent/guards/policy';
import { CurrentUserService } from '@quikday/libs';
import type { ChatMessage } from '@quikday/agent/state/types';

/**
 * RunAuthorizationService handles authorization, permissions, and policy management for runs.
 * Follows Single Responsibility Principle by focusing only on authorization concerns.
 */
@Injectable()
export class RunAuthorizationService {
  private readonly logger = new Logger(RunAuthorizationService.name);

  constructor(
    private prisma: PrismaService,
    private readonly current: CurrentUserService,
  ) {}

  /**
   * Resolve user from auth claims
   */
  async resolveUserFromClaims(claims: any) {
    const sub = claims?.sub || claims?.userId || undefined;
    if (!sub) {
      this.logger.warn('Missing sub in auth claims; cannot resolve user', { claims });
      throw new UnauthorizedException('Missing subject (sub) in auth claims');
    }

    this.logger.debug('👤 Looking up user by sub from auth claims', { sub });
    const user = await this.prisma.user.findUnique({ where: { sub } });
    if (!user) {
      this.logger.warn('Authenticated user not found in database', { sub });
      throw new UnauthorizedException('Authenticated user not found');
    }

    return user;
  }

  /**
   * Validate team and ensure user has access
   */
  async validateTeamAccess(teamId: number | null | undefined, userId: number) {
    if (!teamId) {
      this.logger.debug('No team provided; proceeding with teamless run');
      return null;
    }

    this.logger.debug('🏢 Validating team', { teamId });
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });

    if (team) {
      const membership = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: team.id, userId } },
      });
      if (!membership) {
        this.logger.debug('➕ Adding user to team as member', { userId, teamId: team.id });
        await this.prisma.teamMember.create({
          data: { teamId: team.id, userId, role: 'member' },
        });
      }
    } else {
      this.logger.debug('Team not found; proceeding with teamless run');
    }

    return team;
  }

  /**
   * Check if user owns the run
   */
  async checkOwnership(runId: string, userSub?: string) {
    if (!userSub) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Look up the user by their Kinde sub to get the numeric database ID
    const user = await this.prisma.user.findUnique({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException('User not found in database');
    }

    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { userId: true, teamId: true },
    });

    if (!run) {
      throw new ForbiddenException('Run not found');
    }

    // Owner check
    if (run.userId === user.id) {
      return true;
    }

    // Team member check
    if (run.teamId) {
      const membership = await this.prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: run.teamId,
            userId: user.id,
          },
        },
      });
      if (membership) {
        return true;
      }
    }

    throw new ForbiddenException('Access denied to this run');
  }

  /**
   * Build policy snapshot for a run
   */
  async buildPolicySnapshot(
    teamId: number | null,
    toolAllowlist?: string[],
  ): Promise<TeamPolicy> {
    const base = await getTeamPolicy(teamId !== null ? String(teamId) : undefined);
    const allowlist = new Set<string>(base.allowlist?.tools ?? []);
    if (Array.isArray(toolAllowlist)) {
      toolAllowlist.forEach((tool: string) => {
        if (typeof tool === 'string' && tool.trim()) allowlist.add(tool);
      });
    }
    return {
      ...base,
      allowlist: {
        ...base.allowlist,
        tools: Array.from(allowlist),
      },
    };
  }

  /**
   * Derive scopes from run configuration
   */
  deriveScopesFromRun(
    run: { toolAllowlist: unknown },
    config: Record<string, unknown>,
    policy: TeamPolicy | null,
  ): string[] {
    const scopes = new Set<string>(['runs:execute']);

    const targets = Array.isArray(config.channelTargets)
      ? (config.channelTargets as Array<any>)
      : [];
    targets.forEach((target: any) => {
      if (target && typeof target.appId === 'string') {
        scopes.add(`tool:${target.appId}`);
      }
      if (target && Array.isArray(target.scopes)) {
        target.scopes
          .filter((scope: unknown): scope is string => typeof scope === 'string')
          .forEach((scope: string) => scopes.add(scope));
      }
    });

    const allowlist = this.asRecord(run.toolAllowlist);
    if (Array.isArray(allowlist.tools)) {
      allowlist.tools
        .filter((tool: unknown): tool is string => typeof tool === 'string')
        .forEach((tool: string) => scopes.add(`tool:${tool}`));
    }

    if (policy?.allowlist?.tools) {
      policy.allowlist.tools.forEach((tool: string) => scopes.add(`tool:${tool}`));
    }

    return Array.from(scopes);
  }

  /**
   * Helper: Convert unknown value to record
   */
  asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  /**
   * Helper: Normalize messages array
   */
  normalizeMessages(messages: Array<any> | undefined, prompt?: string): ChatMessage[] {
    const allowedRoles = new Set(['system', 'user', 'assistant', 'tool']);
    const normalized: ChatMessage[] = [];

    if (Array.isArray(messages)) {
      messages.forEach((msg) => {
        if (!msg || typeof msg.content !== 'string') return;
        const trimmed = msg.content.trim();
        if (!trimmed) return;
        const role = allowedRoles.has(msg.role) ? msg.role : 'user';
        const next: ChatMessage = { role, content: trimmed };
        if (msg.ts) next.ts = msg.ts;
        if (msg.toolName) next.toolName = msg.toolName;
        normalized.push(next);
      });
    }

    const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (trimmedPrompt) {
      const lastUser = [...normalized].reverse().find((m) => m.role === 'user');
      if (!lastUser || lastUser.content !== trimmedPrompt) {
        normalized.push({ role: 'user', content: trimmedPrompt });
      }
    }

    return normalized;
  }

  /**
   * Helper: Resolve prompt from messages
   */
  resolvePrompt(prompt: string | undefined, messages: ChatMessage[]): string {
    if (prompt && prompt.trim().length > 0) {
      return prompt.trim();
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return lastUser?.content?.trim() ?? '';
  }

  /**
   * Helper: Get initial status based on mode
   */
  initialStatusForMode(mode: string): string {
    switch (mode) {
      case 'preview':
        return 'planning';
      case 'approval':
        return 'awaiting_approval';
      case 'scheduled':
        return 'scheduled';
      case 'auto':
      default:
        return 'queued';
    }
  }

  /**
   * Helper: Extract input from config
   */
  extractInputFromConfig(config: Record<string, unknown>, fallbackPrompt: string) {
    const input = this.asRecord(config.input);
    const prompt =
      typeof input.prompt === 'string' && input.prompt.trim().length > 0
        ? input.prompt
        : fallbackPrompt;
    const messages = Array.isArray(input.messages) ? (input.messages as ChatMessage[]) : undefined;
    return { prompt, messages };
  }

  /**
   * Helper: Build meta for job
   */
  buildMetaForJob(config: Record<string, unknown>, policy: TeamPolicy | null) {
    const meta = { ...this.asRecord(config.meta) };
    if (Array.isArray(config.channelTargets)) {
      meta.channelTargets = config.channelTargets;
    }
    if (Array.isArray(config.approvedSteps)) {
      meta.approvedSteps = config.approvedSteps;
    }
    if (policy) {
      meta.policy = policy;
    }
    return meta;
  }
}
