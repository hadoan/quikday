// src/auth/current-user.decorators.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getCurrentUserCtx } from './current-user.als.js';

export const CurrentUserId = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext) => getCurrentUserCtx().userId,
);

export const CurrentTeamId = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext) => getCurrentUserCtx().teamId,
);

export const CurrentScopes = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext) => getCurrentUserCtx().scopes,
);
