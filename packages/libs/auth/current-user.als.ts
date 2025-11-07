// src/auth/current-user.als.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { CurrentUserContext } from '@quikday/types';

export const CurrentUserALS = new AsyncLocalStorage<CurrentUserContext>();

export function runWithCurrentUser<T>(ctx: CurrentUserContext, fn: () => T): T {
  return CurrentUserALS.run(ctx, fn);
}

export function getCurrentUserCtx(): CurrentUserContext {
  return CurrentUserALS.getStore() ?? { userSub: null, userId: null, teamId: null, scopes: [] };
}
