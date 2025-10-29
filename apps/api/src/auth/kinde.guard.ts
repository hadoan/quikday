import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import { ConfigService } from '../config/config.service';
import { CurrentUserALS } from '@quikday/libs';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class KindeGuard implements CanActivate {
  private client = this.config.jwksUri
    ? jwksClient({
        jwksUri: this.config.jwksUri,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000, // 10 minutes
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      })
    : null;

  constructor(
    private config: ConfigService,
    private reflector: Reflector
  ) {}

  private getKey = (header: any, cb: (err: any, key?: string) => void) => {
    if (!this.client) return cb(new Error('JWKS client not configured'));
    this.client.getSigningKey(header.kid, (err: any, key: any) => cb(err, key?.getPublicKey()));
  };

  async canActivate(ctx: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (isPublic) {
      return true; // Skip authentication for public routes
    }

    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    if (this.config.isKindeBypass) {
      // In dev, trust any token and assign a minimal user payload
      req.user = { sub: 'dev-user', email: 'dev@example.com', name: 'Dev User' };
      // Populate ALS context so downstream services see userId/teamId
      CurrentUserALS.enterWith({
        userId: 'dev-user',
        teamId: req.header('x-team-id') ?? null,
        scopes: [],
        impersonatorId: null,
        traceId: req.header('x-trace-id') ?? undefined,
        runId: req.header('x-run-id') ?? undefined,
        tz: req.header('x-tz') ?? 'Europe/Berlin',
      } as any);
      return true;
    }

    if (!token) throw new UnauthorizedException('Missing token');

    let payload: any;
    try {
      payload = await new Promise((resolve, reject) => {
        jwt.verify(
          token,
          this.getKey,
          {
            audience: this.config.env.KINDE_AUDIENCE,
            issuer: this.config.normalizedIssuer,
            algorithms: ['RS256'],
            clockTolerance: 5, // seconds of leeway to reduce edge expiries
          },
          (err: any, decoded: any) => (err ? reject(err) : resolve(decoded))
        );
      });
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        // Normalize to 401 with a stable message that frontend can detect and refresh
        throw new UnauthorizedException('jwt expired');
      }
      throw err;
    }
    req.user = payload;
    // After successful verification, seed ALS context for the rest of the request lifecycle
    try {
      const scopes = Array.isArray((payload as any)?.scopes)
        ? (payload as any).scopes
        : typeof (payload as any)?.scope === 'string'
          ? ((payload as any).scope as string).split(' ')
          : [];
      CurrentUserALS.enterWith({
        userId: (payload as any)?.sub ?? null,
        teamId: (payload as any)?.teamId ?? req.header('x-team-id') ?? null,
        scopes,
        impersonatorId: (payload as any)?.impersonatorId ?? null,
        traceId: req.header('x-trace-id') ?? undefined,
        runId: req.header('x-run-id') ?? undefined,
        tz: (payload as any)?.tz ?? req.header('x-tz') ?? 'Europe/Berlin',
      } as any);
    } catch {
      // best-effort; do not block request on ALS issues
    }
    return true;
  }
}
