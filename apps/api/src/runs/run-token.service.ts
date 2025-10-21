import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { ConfigService } from '../config/config.service';

export interface MintRunTokenParams {
  runId: string;
  userId: number;
  teamId?: number | null;
  scopes: string[];
  traceId: string;
  tz: string;
  meta?: Record<string, unknown>;
  expiresInSeconds?: number;
}

@Injectable()
export class RunTokenService {
  constructor(private readonly config: ConfigService) {}

  mint(params: MintRunTokenParams): string {
    const secret = this.config.runTokenSecret;
    const ttl = params.expiresInSeconds ?? this.config.runTokenTtlSeconds;
    const issuer = this.config.runTokenIssuer;

    const payload = {
      rid: params.runId,
      uid: params.userId,
      tid: params.teamId ?? null,
      scopes: Array.from(new Set(params.scopes)),
      traceId: params.traceId,
      tz: params.tz,
      meta: params.meta ?? {},
    } satisfies Record<string, unknown>;

    return jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: ttl,
      issuer,
      subject: `run:${params.runId}`,
      audience: 'runs',
    });
  }

  get defaultTtlSeconds(): number {
    return this.config.runTokenTtlSeconds;
  }
}
