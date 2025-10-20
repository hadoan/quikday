/**
 * Google Calendar OAuth2 - Callback Handler
 *
 * Pure library implementation (no Next.js dependencies).
 * Exchanges OAuth authorization code for access tokens.
 */

import { google } from 'googleapis';
import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

export interface GoogleCalendarCallbackConfig {
  /** Authorization code from Google OAuth redirect */
  code: string;
  /** Google OAuth2 client ID */
  clientId: string;
  /** Google OAuth2 client secret */
  clientSecret: string;
  /** Redirect URI (must match the one used in auth URL) */
  redirectUri: string;
}

export interface GoogleCalendarTokens {
  /** Access token for API requests */
  access_token?: string | null;
  /** Refresh token for obtaining new access tokens */
  refresh_token?: string | null;
  /** Scope granted by user */
  scope?: string;
  /** Token type (usually 'Bearer') */
  token_type?: string | null;
  /** Expiry timestamp (Unix time in milliseconds) */
  expiry_date?: number | null;
  /** ID token (JWT with user info) */
  id_token?: string | null;
}

export interface GoogleCalendarCallbackResult {
  /** Token data to store in database */
  tokens: GoogleCalendarTokens;
  /** Raw token response from Google */
  raw: any;
  /** Success indicator */
  success: boolean;
}

/**
 * Exchange OAuth authorization code for Google Calendar tokens.
 *
 * @param config - Callback configuration (code, clientId, clientSecret, redirectUri)
 * @returns Token data ready to store in credential database
 *
 * @throws Error if token exchange fails or config is invalid
 *
 * @example
 * ```typescript
 * const result = await exchangeGoogleCalendarCode({
 *   code: 'auth_code_from_google',
 *   clientId: process.env.GOOGLE_CLIENT_ID,
 *   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
 *   redirectUri: 'https://app.quik.day/api/integrations/google-calendar/callback',
 * });
 *
 * // Store result.tokens in database (encrypted)
 * await prisma.credential.create({
 *   data: {
 *     type: 'google_calendar',
 *     key: result.tokens, // Encrypt this before storing!
 *     userId: user.id,
 *     appId: 'google-calendar',
 *   },
 * });
 * ```
 */
export async function exchangeGoogleCalendarCode(
  config: GoogleCalendarCallbackConfig
): Promise<GoogleCalendarCallbackResult> {
  const { code, clientId, clientSecret, redirectUri } = config;

  // Validate required config
  if (!code) {
    throw new Error('Google Calendar: authorization code is required');
  }
  if (!clientId) {
    throw new Error('Google Calendar: client_id is required');
  }
  if (!clientSecret) {
    throw new Error('Google Calendar: client_secret is required');
  }
  if (!redirectUri) {
    throw new Error('Google Calendar: redirect_uri is required');
  }

  // Create OAuth2 client
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    // Exchange code for tokens
    const tokenResponse = await oAuth2Client.getToken(code);

    // Extract tokens from response
    const tokens: GoogleCalendarTokens = {
      access_token: tokenResponse.tokens.access_token,
      refresh_token: tokenResponse.tokens.refresh_token,
      scope: tokenResponse.tokens.scope,
      token_type: tokenResponse.tokens.token_type,
      expiry_date: tokenResponse.tokens.expiry_date,
      id_token: tokenResponse.tokens.id_token,
    };

    return {
      tokens,
      raw: tokenResponse.res?.data || tokenResponse.tokens,
      success: true,
    };
  } catch (error) {
    // Wrap error with context
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Google Calendar token exchange failed: ${message}`);
  }
}

/**
 * Validate that tokens contain required fields for Google Calendar API.
 *
 * @param tokens - Token object to validate
 * @returns True if tokens are valid, false otherwise
 */
export function validateGoogleCalendarTokens(tokens: GoogleCalendarTokens): boolean {
  // Must have either access_token or refresh_token
  const hasAccessToken = !!tokens.access_token;
  const hasRefreshToken = !!tokens.refresh_token;

  return hasAccessToken || hasRefreshToken;
}

/**
 * Check if access token is expired or about to expire.
 *
 * @param tokens - Token object with expiry_date
 * @param bufferMs - Time buffer in milliseconds (default: 5 minutes)
 * @returns True if token is expired or will expire within buffer time
 */
export function isTokenExpired(tokens: GoogleCalendarTokens, bufferMs = 5 * 60 * 1000): boolean {
  if (!tokens.expiry_date) {
    // No expiry date - assume expired for safety
    return true;
  }

  const now = Date.now();
  const expiryWithBuffer = tokens.expiry_date - bufferMs;

  return now >= expiryWithBuffer;
}

/**
 * Refresh Google Calendar access token using refresh token.
 *
 * @param config - Refresh config (refresh_token, clientId, clientSecret)
 * @returns New token data
 *
 * @throws Error if refresh fails or refresh_token is missing
 *
 * @example
 * ```typescript
 * const newTokens = await refreshGoogleCalendarToken({
 *   refreshToken: storedCredential.key.refresh_token,
 *   clientId: process.env.GOOGLE_CLIENT_ID,
 *   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
 * });
 *
 * // Update stored credential with new tokens
 * await prisma.credential.update({
 *   where: { id: credentialId },
 *   data: { key: newTokens.tokens },
 * });
 * ```
 */
export async function refreshToken(config: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleCalendarCallbackResult> {
  const { refreshToken, clientId, clientSecret } = config;

  if (!refreshToken) {
    throw new Error('Google Calendar: refresh_token is required');
  }
  if (!clientId) {
    throw new Error('Google Calendar: client_id is required');
  }
  if (!clientSecret) {
    throw new Error('Google Calendar: client_secret is required');
  }

  // Create OAuth2 client and set credentials
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    // Refresh access token
    const tokenResponse = await oAuth2Client.refreshAccessToken();

    const tokens: GoogleCalendarTokens = {
      access_token: tokenResponse.credentials.access_token,
      refresh_token: tokenResponse.credentials.refresh_token || refreshToken, // Keep old refresh_token if new one not provided
      scope: tokenResponse.credentials.scope,
      token_type: tokenResponse.credentials.token_type,
      expiry_date: tokenResponse.credentials.expiry_date,
      id_token: tokenResponse.credentials.id_token,
    };

    return {
      tokens,
      raw: tokenResponse.res?.data || tokenResponse.credentials,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Google Calendar token refresh failed: ${message}`);
  }
}

/**
 * End-to-end handler for the OAuth callback flow.
 * - Parses `code` and `state` from request
 * - Loads client keys (DB first, env fallback)
 * - Exchanges code for tokens
 * - Persists credential via provided Prisma service
 * - Returns redirect target
 */
export async function callback(params: {
  req: any;
  meta: AppMeta;
  prisma: any;
}): Promise<{ redirectTo: string }> {
  const { req, meta, prisma } = params;

  console.log('📅 [Google Calendar] OAuth callback started', {
    slug: meta.slug,
    timestamp: new Date().toISOString(),
    hasCode: !!req.query?.code,
    hasState: !!req.query?.state,
    hasError: !!req.query?.error,
  });

  const code = typeof req.query?.code === 'string' ? req.query.code : undefined;
  const rawState = typeof req.query?.state === 'string' ? req.query.state : undefined;

  if (!code) {
    console.error('📅 [Google Calendar] OAuth callback failed: missing code parameter', {
      slug: meta.slug,
      queryParams: Object.keys(req.query || {}),
      error: req.query?.error,
    });
    const err: any = new Error('`code` must be a string');
    err.statusCode = 400;
    throw err;
  }

  // Parse state (best effort)
  let state: any = undefined;
  try {
    state = rawState ? JSON.parse(rawState) : undefined;
    console.log('📅 [Google Calendar] State parsed successfully', {
      hasUserId: !!state?.userId,
      hasReturnTo: !!state?.returnTo,
    });
  } catch (error) {
    console.warn('📅 [Google Calendar] Failed to parse state', {
      rawState,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // ignore malformed state
  }

  // Resolve OAuth credentials: prefer DB keys, fallback to env
  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let credentialSource = 'env';
  
  try {
    console.log('📅 [Google Calendar] Attempting to load credentials from database', {
      slug: meta.slug,
    });
    const appKeys = (await getAppKeysFromSlug(meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') {
      clientId = appKeys.client_id;
      credentialSource = 'database';
    }
    if (typeof appKeys?.client_secret === 'string') {
      clientSecret = appKeys.client_secret;
    }
    console.log('📅 [Google Calendar] Credentials loaded', {
      source: credentialSource,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
  } catch (error) {
    console.warn('📅 [Google Calendar] Failed to load credentials from database, using env vars', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // rely on env vars if DB lookup fails
  }

  if (!clientId) {
    console.error('📅 [Google Calendar] Missing client_id', {
      checkedEnv: !!process.env.GOOGLE_CLIENT_ID,
      checkedDb: credentialSource === 'database',
    });
    const err: any = new Error('Google client_id missing.');
    err.statusCode = 400;
    throw err;
  }
  if (!clientSecret) {
    console.error('📅 [Google Calendar] Missing client_secret', {
      checkedEnv: !!process.env.GOOGLE_CLIENT_SECRET,
      checkedDb: credentialSource === 'database',
    });
    const err: any = new Error('Google client_secret missing.');
    err.statusCode = 400;
    throw err;
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  console.log('📅 [Google Calendar] Constructed redirect URI', {
    redirectUri,
    baseUrl,
    slug: meta.slug,
  });

  // Exchange auth code for tokens
  console.log('📅 [Google Calendar] Exchanging authorization code for tokens');
  const startTime = Date.now();
  
  try {
    const result = await exchangeGoogleCalendarCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    const duration = Date.now() - startTime;
    console.log('📅 [Google Calendar] Token exchange successful', {
      duration: `${duration}ms`,
      hasAccessToken: !!result.tokens.access_token,
      hasRefreshToken: !!result.tokens.refresh_token,
      scope: result.tokens.scope,
      expiryDate: result.tokens.expiry_date,
    });

    // Resolve authenticated user to a numeric userId
    let numericUserId: number | undefined;
    try {
      const sub = (req?.user?.sub ?? (typeof state?.userId === 'string' ? state.userId : undefined)) as
        | string
        | undefined;
      const email = (req?.user?.email as string | undefined) || undefined;
      const displayName = (req?.user?.name as string | undefined) || undefined;

      if (sub) {
        const user = await prisma.user.upsert({
          where: { sub },
          update: {},
          create: { sub, email: email || null, displayName: displayName || null },
        });
        numericUserId = user.id;
      } else if (email) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) numericUserId = existing.id;
      }
    } catch (e) {
      console.warn('📅 [Google Calendar] Failed to resolve user, saving credential without userId', {
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }

    console.log('📅 [Google Calendar] Persisting credential to database', {
      userId: numericUserId ?? 'none',
      type: meta.slug.replace(/-/g, '_'),
      appId: meta.slug,
    });

    // Persist credential
    const type = meta.slug.replace(/-/g, '_');
    const credential = await prisma.credential.create({
      data: {
        type,
        key: result.tokens as any,
        ...(typeof numericUserId === 'number' ? { userId: numericUserId } : {}),
        appId: meta.slug,
      },
    });

    console.log('📅 [Google Calendar] Credential saved successfully', {
      credentialId: credential.id,
      userId: credential.userId,
    });

    // Choose redirect target
    const returnTo = state?.returnTo as string | undefined;
    const redirectTo = returnTo && typeof returnTo === 'string' ? returnTo : `/apps/${meta.variant}/${meta.slug}`;

    console.log('📅 [Google Calendar] OAuth callback completed successfully', {
      redirectTo,
      totalDuration: `${Date.now() - startTime}ms`,
    });

    return { redirectTo };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('📅 [Google Calendar] OAuth callback failed', {
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
