import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { runWithCurrentUser } from './current-user.als.js';

@Injectable()
export class CurrentUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const claims = (req?.user as any) ?? {};
    const hdr = (name: string) => req?.header?.(name) ?? undefined;

    const scopes = Array.isArray(claims.scopes)
      ? claims.scopes
      : typeof claims.scope === 'string'
        ? (claims.scope as string).split(' ')
        : [];

    const ctx = {
      userId: claims.sub ?? hdr('x-user-id') ?? null,
      teamId: claims.teamId ?? hdr('x-team-id') ?? null,
      scopes,
      impersonatorId: claims.impersonatorId ?? hdr('x-impersonator-id') ?? null,
      traceId: hdr('x-trace-id'),
      runId: hdr('x-run-id'),
      tz: claims.tz ?? hdr('x-tz') ?? 'Europe/Berlin',
    } as any;

    return runWithCurrentUser(ctx, () => next.handle());
  }
}
