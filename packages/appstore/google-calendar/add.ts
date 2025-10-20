/**
 * Google Calendar OAuth2 - Add Integration
 *
 * Pure library implementation (no Next.js dependencies).
 * Generates Google Calendar OAuth URL for user authorization.
 */

import { google } from 'googleapis';
import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

/**
 * OAuth scopes required for Google Calendar integration.
 * - calendar.readonly: Read calendar events
 * - calendar.events: Create, update, delete events
 */
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export interface GoogleCalendarAuthConfig {
  /** Google OAuth2 client ID */
  clientId: string;
  /** Google OAuth2 client secret */
  clientSecret: string;
  /** Redirect URI where Google will send the auth code */
  redirectUri: string;
  /** Optional state parameter for CSRF protection and session tracking */
  state?: string;
}

export interface GoogleCalendarAuthUrlResult {
  /** OAuth authorization URL to redirect user to */
  url: string;
  /** Scopes requested */
  scopes: string[];
}

/**
 * Generate Google Calendar OAuth authorization URL.
 *
 * @param config - OAuth configuration (client_id, client_secret, redirect_uri, state)
 * @returns Authorization URL and scopes
 *
 * @example
 * ```typescript
 * const result = generateGoogleCalendarAuthUrl({
 *   clientId: process.env.GOOGLE_CLIENT_ID,
 *   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
 *   redirectUri: 'https://app.quik.day/api/integrations/google-calendar/callback',
 *   state: encodeState({ userId: '123', teamId: 'abc' }),
 * });
 * // Redirect user to result.url
 * ```
 */
export function generateGoogleCalendarAuthUrl(
  config: GoogleCalendarAuthConfig,
): GoogleCalendarAuthUrlResult {
  const { clientId, clientSecret, redirectUri, state } = config;

  // Validate required config
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

  // Generate authorization URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    scope: GOOGLE_CALENDAR_SCOPES,
    prompt: 'consent', // Force consent to always get refresh_token
    ...(state && { state }), // Include state if provided
  });

  return {
    url: authUrl,
    scopes: GOOGLE_CALENDAR_SCOPES,
  };
}

/**
 * Convenience export of scopes for external use.
 */
export { GOOGLE_CALENDAR_SCOPES };

/**
 * Resolve Google Calendar OAuth URL from an incoming request and app metadata.
 * - Prefers keys stored in DB App.keys; falls back to env GOOGLE_CLIENT_ID/SECRET
 * - Builds redirectUri from API_BASE_URL (or request host) and meta.slug
 * - Encodes simple JSON state for CSRF/session context
 */
export async function resolveGoogleCalendarAuthUrl(params: {
  req: any;
  meta: AppMeta;
}): Promise<GoogleCalendarAuthUrlResult> {
  const { req, meta } = params;

  console.log('📅 [Add] resolveGoogleCalendarAuthUrl called', {
    slug: meta.slug,
    hasReqUser: !!req.user,
    reqHeaders: req.headers,
    reqSession: req.session,
  });

  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    const appKeys = (await getAppKeysFromSlug(meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
    if (typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret;
  } catch {
    // Ignore DB lookup failures and rely on env vars
  }

  if (!clientId) {
    throw new Error('Google Calendar OAuth credentials not configured: client_id missing');
  }
  if (!clientSecret) {
    throw new Error('Google Calendar OAuth credentials not configured: client_secret missing');
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  const userId = req.user?.id || req.user?.sub;
  
  console.log('📅 [Add] User info extraction', {
    'req.user': req.user,
    'req.user.id': req.user?.id,
    'req.user.sub': req.user?.sub,
    'resolved userId': userId || 'none',
  });

  const state = JSON.stringify({
    userId,
    timestamp: Date.now(),
  });

  console.log('📅 [Add] State being passed', { state });

  return generateGoogleCalendarAuthUrl({
    clientId,
    clientSecret,
    redirectUri,
    state,
  });
}
