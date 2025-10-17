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
});

@Injectable()
export class ConfigService {
  readonly env = EnvSchema.parse(process.env);

  get isKindeBypass(): boolean {
    return this.env.KINDE_BYPASS === 'true';
  }
}
