import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to mark routes as public (bypass KindeGuard).
 * Use this for OAuth callbacks, webhooks, and other endpoints
 * that cannot include Bearer tokens.
 *
 * @example
 * ```typescript
 * @Get('callback')
 * @Public()
 * async oauthCallback(@Req() req: Request) {
 *   // This endpoint is accessible without authentication
 * }
 * ```
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
