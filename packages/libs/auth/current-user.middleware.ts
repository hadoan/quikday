// src/auth/current-user.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { runWithCurrentUser } from './current-user.als.js';
import type { CurrentUserContext } from '@quikday/types';

function buildCtxFromRequest(req: Request): CurrentUserContext {
  // Primary source: whatever your auth guard put here
  const claims = (req as any).user ?? {};
  // Fallbacks (useful for internal calls / tests)
  const hdr = (name: string) => req.header(name) ?? undefined;

  return {
    userSub: claims.sub ?? hdr('x-user-id') ?? null,
    userId: claims.userId ?? (hdr('x-user-db-id') ? parseInt(hdr('x-user-db-id')!, 10) : null),
    teamId: claims.teamId ?? hdr('x-team-id') ?? null,
    scopes: claims.scopes ?? claims.scope?.split(' ') ?? [],
    impersonatorId: claims.impersonatorId ?? hdr('x-impersonator-id') ?? null,
    traceId: hdr('x-trace-id'),
    runId: hdr('x-run-id'),
    tz: claims.tz ?? hdr('x-tz') ?? 'Europe/Berlin',
  };
}

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const ctx = buildCtxFromRequest(req);
    runWithCurrentUser(ctx, next);
  }
}
