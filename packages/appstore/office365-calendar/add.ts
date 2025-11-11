import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';
import { Office365CalendarAuthConfig } from './types/Office365CalendarAuthConfig.js';
import { Office365CalendarAuthUrlResult } from './types/Office365CalendarAuthUrlResult.js';

/**
 * OAuth scopes required for Office 365 Calendar integration.
 * - User.Read: Read basic user profile info
 * - Calendars.Read: Read calendar events
 * - Calendars.ReadWrite: Create, update, delete events
 * - offline_access: Allow refresh token for long-term access
 */
const OFFICE365_CALENDAR_SCOPES = [
  'User.Read',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'offline_access',
];

export function generateOffice365CalendarAuthUrl(
  config: Office365CalendarAuthConfig,
): Office365CalendarAuthUrlResult {
  const { clientId, clientSecret, redirectUri, state } = config;

  // Validate required config
  if (!clientId) {
    throw new Error('Office 365 Calendar: client_id is required');
  }
  if (!clientSecret) {
    throw new Error('Office 365 Calendar: client_secret is required');
  }
  if (!redirectUri) {
    throw new Error('Office 365 Calendar: redirect_uri is required');
  }

  // Build query parameters
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OFFICE365_CALENDAR_SCOPES.join(' '),
    response_mode: 'query',
    ...(state && { state }),
  });

  // Generate authorization URL
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

  return {
    url: authUrl,
    scopes: OFFICE365_CALENDAR_SCOPES,
  };
}

export async function resolveOffice365CalendarAuthUrl(params: {
  req: any;
  meta: AppMeta;
  signedState?: string; // Optional pre-signed state from API
  prisma?: any; // Optional Prisma service for app key lookup
}): Promise<Office365CalendarAuthUrlResult> {
  const { req, meta, signedState, prisma } = params;

  let clientId: string | undefined = undefined;
  let clientSecret: string | undefined = undefined;

  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
    if (typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret;
  } catch {
    // Ignore DB lookup failures and rely on env vars
  }

  // Fallback to environment variables
  if (!clientId) {
    clientId = process.env.OFFICE365_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
  }
  if (!clientSecret) {
    clientSecret = process.env.OFFICE365_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
  }

  if (!clientId) {
    throw new Error('Office 365 Calendar OAuth credentials not configured: client_id missing');
  }
  if (!clientSecret) {
    throw new Error('Office 365 Calendar OAuth credentials not configured: client_secret missing');
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

  return generateOffice365CalendarAuthUrl({
    clientId,
    clientSecret,
    redirectUri,
    state,
  });
}
