import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().optional(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KINDE_ISSUER_URL: z.string().url().optional(),
  KINDE_AUDIENCE: z.string().optional(),
  KINDE_JWKS_URL: z.string().url().optional(),
  KINDE_BYPASS: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  ENCRYPTION_MASTER_KEY_BASE64: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  RUN_TOKEN_SECRET: z.string().optional(),
  RUN_TOKEN_ISSUER: z.string().optional(),
  RUN_TOKEN_TTL_SEC: z.string().optional(),
});

@Injectable()
export class ConfigService {
  readonly env = EnvSchema.parse(process.env);

  get isKindeBypass(): boolean {
    return this.env.KINDE_BYPASS === 'true';
  }

  // Normalize issuer by stripping trailing slash
  get normalizedIssuer(): string | undefined {
    const raw = this.env.KINDE_ISSUER_URL;
    if (!raw) return undefined;
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  // Prefer explicit JWKS URL, fallback to issuer-based well-known URL
  get jwksUri(): string | undefined {
    if (this.env.KINDE_JWKS_URL) return this.env.KINDE_JWKS_URL;
    const issuer = this.normalizedIssuer;
    return issuer ? `${issuer}/.well-known/jwks.json` : undefined;
  }

  get runTokenSecret(): string {
    return this.env.RUN_TOKEN_SECRET || 'dev-run-token-secret';
  }

  get runTokenIssuer(): string {
    return this.env.RUN_TOKEN_ISSUER || 'runfast-control-plane';
  }

  get runTokenTtlSeconds(): number {
    const raw = this.env.RUN_TOKEN_TTL_SEC;
    if (!raw) return 15 * 60;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60;
  }
}
