// src/auth/current-user.service.ts
import { Injectable } from '@nestjs/common';
import { ICurrentUserService } from './ICurrentUserService.js';
import { getCurrentUserCtx } from './current-user.als.js';

@Injectable()
export class CurrentUserService implements ICurrentUserService {
  getCurrentUserId(): string | null {
    return getCurrentUserCtx().userId;
  }
  getCurrentTeamId(): string | null {
    return getCurrentUserCtx().teamId;
  }
  getScopes(): string[] {
    return getCurrentUserCtx().scopes ?? [];
  }
  isAuthenticated(): boolean {
    return !!getCurrentUserCtx().userId;
  }
}
