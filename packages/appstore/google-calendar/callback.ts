/**
 * Google Calendar OAuth2 - Callback Handler
 *
 * Pure library implementation (no Next.js dependencies).
 * Exchanges OAuth authorization code for access tokens.
 */

import { google } from 'googleapis';

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
  token_type?: string;
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
export async function refreshGoogleCalendarToken(config: {
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
