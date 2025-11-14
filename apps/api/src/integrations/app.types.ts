import { PrismaService as QuikdayPrismaService } from '@quikday/prisma';
import type { OAuthState } from '../auth/oauth-state.util.js';
import type { CurrentUserService } from '@quikday/libs';

export interface AppDeps {
  prisma: QuikdayPrismaService;
  currentUserService: CurrentUserService;
  /** Create signed OAuth state for CSRF protection */
  createSignedState: (state: OAuthState) => string;
  /** Validate signed OAuth state from callback */
  validateSignedState: (signedState: string, maxAgeMs?: number) => OAuthState;
  /* add logger, config, httpClient as needed */
}
