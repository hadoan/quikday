/**
 * Google Calendar OAuth2 - Add Integration
 *
 * Pure library implementation (no Next.js dependencies).
 * Generates Google Calendar OAuth URL for user authorization.
 */

import { google } from 'googleapis';

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
