import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import type { Prisma } from '@prisma/client';

type JwtClaims = {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(private prisma: PrismaService) {}

  private computeNameFromClaims(claims: JwtClaims): string {
    // Prefer full name, then construct from parts, then fallback to email
    if (claims.name?.trim()) return claims.name.trim();

    const parts = [claims.given_name, claims.family_name].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');

    const emailLocal = claims.email?.split('@')[0];
    return emailLocal && emailLocal.length > 0 ? emailLocal : 'User';
  }

  private fallbackEmailFromSub(sub: string): string {
    // Deterministic, non-routable email
    return `user-${sub}@users.local`;
  }

  private uniqueSlugFromSub(sub: string): string {
    const prefix = sub
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toLowerCase();
    const ts = Date.now();
    return `ws-${prefix}-${ts}`;
  }

  async getOrProvisionUserAndWorkspace(claims: JwtClaims) {
    const sub = claims.sub;
    if (!sub) throw new Error('Missing sub in token');

    const name = this.computeNameFromClaims(claims);
    const email = claims.email || this.fallbackEmailFromSub(sub);

    // Try to find existing user with workspace
    const existing = await this.prisma.user.findUnique({
      where: { sub },
      include: { workspace: true },
    });

    if (!existing) {
      // Create user + workspace concurrently in a transaction
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              sub,
              email,
              displayName: name,
              avatar: claims.picture,
              plan: 'PRO',
            },
          });

          const wsName = `${name}'s Workspace`;
          const slug = this.uniqueSlugFromSub(sub);
          const workspace = await tx.workspace.create({
            data: {
              name: wsName,
              slug,
              plan: 'PRO',
              ownerUserId: user.id,
            },
          });

          return { user, workspace };
        });

        // Update lastLoginAt, failure non-fatal
        void this.prisma.user
          .update({ where: { id: created.user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => undefined);

        return {
          id: created.user.id,
          email: created.user.email,
          name: created.user.displayName || name,
          authSub: sub,
          workspaceId: created.workspace.id,
          workspaceSlug: created.workspace.slug,
          plan: created.user.plan,
        };
      } catch (err: any) {
        // Handle unique constraint races and re-fetch
        const code = err?.code as string | undefined;
        if (code === 'P2002') {
          this.logger.warn('Unique constraint hit during provisioning; retrying find');
          const retry = await this.prisma.user.findUnique({
            where: { sub },
            include: { workspace: true },
          });
          if (retry) {
            void this.prisma.user
              .update({ where: { id: retry.id }, data: { lastLoginAt: new Date() } })
              .catch(() => undefined);
            return {
              id: retry.id,
              email: retry.email,
              name: retry.displayName || name,
              authSub: sub,
              workspaceId: retry.workspace?.id,
              workspaceSlug: retry.workspace?.slug,
              plan: retry.plan,
            };
          }
        }
        throw err;
      }
    }

    // Existing user - update their profile info and lastLoginAt
    void this.prisma.user
      .update({
        where: { id: existing.id },
        data: {
          email: email !== this.fallbackEmailFromSub(sub) ? email : existing.email,
          displayName: name,
          avatar: claims.picture || existing.avatar,
          lastLoginAt: new Date(),
        },
      })
      .catch(() => undefined);

    return {
      id: existing.id,
      email: existing.email,
      name: existing.displayName || name,
      authSub: sub,
      workspaceId: existing.workspace?.id,
      workspaceSlug: existing.workspace?.slug,
      plan: existing.plan,
    };
  }

  async updateCurrentUser(id: number, data: { name?: string; avatar?: string }) {
    const updates: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) updates.displayName = data.name;
    if (data.avatar !== undefined) updates.avatar = data.avatar;

    const updated = await this.prisma.user.update({ where: { id }, data: updates });
    return {
      id: updated.id,
      email: updated.email,
      name: updated.displayName || undefined,
      avatar: updated.avatar || undefined,
      plan: updated.plan,
      createdAt: updated.createdAt,
      lastLoginAt: updated.lastLoginAt || undefined,
    };
  }
}
