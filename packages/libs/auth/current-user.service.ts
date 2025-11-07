// src/auth/current-user.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { ICurrentUserService } from './ICurrentUserService.js';
import { getCurrentUserCtx } from './current-user.als.js';

@Injectable()
export class CurrentUserService implements ICurrentUserService {
  constructor(
    @Inject('CurrentUserPrisma')
    private readonly prisma: { user: { findUnique: (q: any) => Promise<{ displayName?: string | null; email?: string | null } | null> } },
  ) {}
  getCurrentUserSub(): string | null {
    return getCurrentUserCtx().userSub;
  }
  getCurrentTeamId(): number | null {
    return getCurrentUserCtx().teamId;
  }
  getScopes(): string[] {
    return getCurrentUserCtx().scopes ?? [];
  }
  isAuthenticated(): boolean {
    return !!getCurrentUserCtx().userSub;
  }

  /**
   * Resolve display name and email for a user. If userId is omitted,
   * it uses the current ALS context's userId. Requires a Prisma-like
   * client with a `user.findUnique({ where: { id } })` API.
   */
  async getUserIdentity(): Promise<{ userName?: string; userEmail?: string }> {
    try {
      const id = this.getCurrentUserSub() || undefined;
      if (!id) return {};
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) return {};
      const userEmail = (user.email ?? undefined) as string | undefined;
      let userName = (user.displayName ?? undefined) as string | undefined;
      if (!userName && userEmail) {
        try {
          const local = String(userEmail).split('@')[0] ?? '';
          userName = local
            .replace(/[._-]+/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
        } catch {
          // ignore
        }
      }
      return { userName, userEmail };
    } catch {
      return {};
    }
  }
}
