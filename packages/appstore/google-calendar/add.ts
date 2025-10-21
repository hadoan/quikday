import { google } from 'googleapis';
import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';
import { GoogleCalendarAuthConfig } from './types/GoogleCalendarAuthConfig.js';
import { GoogleCalendarAuthUrlResult } from './types/GoogleCalendarAuthUrlResult.js';

/**
 * OAuth scopes required for Google Calendar integration.
 * - calendar.readonly: Read calendar events
 * - calendar.events: Create, update, delete events
 */
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

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

export async function resolveGoogleCalendarAuthUrl(params: {
  req: any;
  meta: AppMeta;
  signedState?: string; // Optional pre-signed state from API
}): Promise<GoogleCalendarAuthUrlResult> {
  const { req, meta, signedState } = params;

  let clientId = undefined;
  let clientSecret = undefined;

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

  // Use pre-signed state if provided (recommended), otherwise create unsigned fallback
  let state: string;
  if (signedState) {
    state = signedState;
    // using pre-signed state (secure)
  } else {
    // Fallback: unsigned state (less secure, for backwards compatibility)
    const userId = req.user?.id || req.user?.sub;
    // creating unsigned state (fallback); user info used if available

    state = JSON.stringify({
      userId,
      timestamp: Date.now(),
    });
    console.warn(
      '⚠️  Using unsigned OAuth state - consider using signed state for better security',
    );
  }

  // state prepared (signed flag available via signedState)

  return generateGoogleCalendarAuthUrl({
    clientId,
    clientSecret,
    redirectUri,
    state,
  });
}
