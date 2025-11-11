import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';
import { Office365CalendarCallbackConfig } from './types/Office365CalendarCallbackConfig.js';
import { Office365CalendarTokens } from './types/Office365CalendarTokens.js';
import { Office365CalendarCallbackResult } from './types/Office365CalendarCallbackResult.js';

const OFFICE365_CALENDAR_SCOPES = [
  'User.Read',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'offline_access',
];

export async function exchangeCode(
  config: Office365CalendarCallbackConfig,
): Promise<Office365CalendarCallbackResult> {
  const { code, clientId, clientSecret, redirectUri } = config;

  // Validate required config
  if (!code) {
    throw new Error('Office 365 Calendar: authorization code is required');
  }
  if (!clientId) {
    throw new Error('Office 365 Calendar: client_id is required');
  }
  if (!clientSecret) {
    throw new Error('Office 365 Calendar: client_secret is required');
  }
  if (!redirectUri) {
    throw new Error('Office 365 Calendar: redirect_uri is required');
  }

  try {
    // Prepare token exchange request
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope: OFFICE365_CALENDAR_SCOPES.join(' '),
    });

    // Exchange code for tokens
    const response = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.statusText} - ${errorText}`);
    }

    const tokenData = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    };

    // Fetch user info to get email
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    let email: string | undefined;
    if (userResponse.ok) {
      const userData = (await userResponse.json()) as {
        mail?: string | null;
        userPrincipalName?: string;
      };
      email = userData.mail ?? userData.userPrincipalName;
    }

    // Calculate expiry timestamp
    const expiresIn = Math.round(Date.now() / 1000 + tokenData.expires_in);

    const tokens: Office365CalendarTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: expiresIn,
      scope: tokenData.scope,
      token_type: tokenData.token_type,
      email,
    };

    return {
      tokens,
      raw: tokenData,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Office 365 Calendar token exchange failed: ${message}`);
  }
}

/**
 * Validate that tokens contain required fields for Office 365 Calendar API.
 */
export function validateOffice365CalendarTokens(tokens: Office365CalendarTokens): boolean {
  const hasAccessToken = !!tokens.access_token;
  const hasRefreshToken = !!tokens.refresh_token;
  return hasAccessToken || hasRefreshToken;
}

/**
 * Check if access token is expired or about to expire.
 */
export function isTokenExpired(
  tokens: Office365CalendarTokens,
  bufferSeconds = 5 * 60,
): boolean {
  if (!tokens.expires_in) {
    return true;
  }
  const now = Math.round(Date.now() / 1000);
  const expiryWithBuffer = tokens.expires_in - bufferSeconds;
  return now >= expiryWithBuffer;
}

export async function callback(params: {
  req: any;
  meta: AppMeta;
  prisma: any;
}): Promise<{ redirectTo: string }> {
  const { req, meta, prisma } = params;

  const code = typeof req.query?.code === 'string' ? req.query.code : undefined;
  const rawState = typeof req.query?.state === 'string' ? req.query.state : undefined;

  if (!code) {
    console.error('📅 [Office 365 Calendar] OAuth callback failed: missing code parameter', {
      slug: meta.slug,
      queryParams: Object.keys(req.query || {}),
      error: req.query?.error,
    });
    const err: any = new Error('`code` must be a string');
    err.statusCode = 400;
    throw err;
  }

  // Parse and validate state
  let state: any = undefined;
  let stateValidationMethod = 'none';

  try {
    if (!rawState) {
      throw new Error('State parameter is required for security');
    }

    // Try parsing as signed state first
    if (rawState.includes('.')) {
      stateValidationMethod = 'signed';
      console.warn(
        '📅 [Office 365 Calendar] Signed state detected but validation not implemented in this layer',
      );
      console.warn(
        '📅 [Office 365 Calendar] Implement validateSignedState in API layer for security',
      );

      const [data] = rawState.split('.');
      const decoded = Buffer.from(data, 'base64url').toString('utf-8');
      state = JSON.parse(decoded);
      stateValidationMethod = 'signed-fallback';
    } else {
      // Legacy unsigned state
      stateValidationMethod = 'unsigned';
      state = JSON.parse(rawState);
      console.warn(
        '⚠️  [Office 365 Calendar] Received unsigned state - upgrade to signed state for security',
      );
    }

    if (!state?.userId) {
      throw new Error('State missing required userId field');
    }

    // Check timestamp expiry (10 minutes)
    if (state?.timestamp) {
      const age = Date.now() - state.timestamp;
      const maxAge = 10 * 60 * 1000;
      if (age > maxAge) {
        throw new Error(`State expired (${Math.round(age / 1000)}s old, max ${maxAge / 1000}s)`);
      }
    }
  } catch (error) {
    console.error('📅 [Office 365 Calendar] State validation failed', {
      rawState: rawState?.substring(0, 50) + '...',
      error: error instanceof Error ? error.message : 'Unknown error',
      method: stateValidationMethod,
    });
    const err: any = new Error(
      error instanceof Error ? error.message : 'Invalid or expired state parameter',
    );
    err.statusCode = 400;
    throw err;
  }

  // Resolve OAuth credentials
  let clientId: string | undefined = undefined;
  let clientSecret: string | undefined = undefined;
  let credentialSource = 'env';

  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') {
      clientId = appKeys.client_id;
      credentialSource = 'database';
    }
    if (typeof appKeys?.client_secret === 'string') {
      clientSecret = appKeys.client_secret;
    }
  } catch (error) {
    console.warn(
      '📅 [Office 365 Calendar] Failed to load credentials from database, using env vars',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    );
  }

  // Fallback to environment variables
  if (!clientId) {
    clientId = process.env.OFFICE365_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
  }
  if (!clientSecret) {
    clientSecret = process.env.OFFICE365_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
  }

  if (!clientId) {
    console.error('📅 [Office 365 Calendar] Missing client_id', {
      checkedEnv: !!(process.env.OFFICE365_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID),
      checkedDb: credentialSource === 'database',
    });
    const err: any = new Error('Office 365 client_id missing.');
    err.statusCode = 400;
    throw err;
  }
  if (!clientSecret) {
    console.error('📅 [Office 365 Calendar] Missing client_secret', {
      checkedEnv: !!(process.env.OFFICE365_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET),
      checkedDb: credentialSource === 'database',
    });
    const err: any = new Error('Office 365 client_secret missing.');
    err.statusCode = 400;
    throw err;
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  const startTime = Date.now();

  try {
    const result = await exchangeCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    const duration = Date.now() - startTime;

    // Resolve authenticated user
    let numericUserId: number | undefined;
    try {
      const sub = (req?.user?.sub ??
        (typeof state?.userId === 'string' ? state.userId : undefined)) as string | undefined;
      const email =
        (req?.user?.email as string | undefined) || result.tokens.email || undefined;
      const rawName = (req?.user?.name as string | undefined) || undefined;

      const inferredName = (() => {
        if (rawName && rawName.trim()) return rawName.trim();
        if (email) {
          const local = email.split('@')[0] ?? '';
          const tokens = local
            .replace(/[._-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean)
            .slice(0, 4);
          if (tokens.length > 0) {
            return tokens
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(' ');
          }
        }
        return undefined;
      })();

      if (sub) {
        const user = await prisma.user.upsert({
          where: { sub },
          update: {},
          create: { sub, email: email || null, displayName: inferredName || null },
        });
        numericUserId = user.id;
      } else if (email) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) numericUserId = existing.id;
      }
    } catch (e) {
      console.warn(
        '📅 [Office 365 Calendar] Failed to resolve user, saving credential without userId',
        {
          error: e instanceof Error ? e.message : 'Unknown error',
        },
      );
    }

    // Persist credential
    const type = meta.slug;
    const emailOrUserName = result.tokens.email;
    const tokenExpiresAt =
      typeof result.tokens.expires_in === 'number'
        ? new Date(result.tokens.expires_in * 1000)
        : undefined;

    await prisma.credential.create({
      data: {
        type,
        key: result.tokens as any,
        ...(typeof numericUserId === 'number' ? { userId: numericUserId } : {}),
        appId: meta.slug,
        ...(emailOrUserName ? { emailOrUserName } : {}),
        ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
      },
    });

    // Choose redirect target
    const returnTo = state?.returnTo as string | undefined;
    const defaultWeb = process.env.WEBAPP_URL || process.env.WEBAPP_BASE_URL;
    const defaultRedirect = defaultWeb ? `${defaultWeb.replace(/\/$/, '')}/apps` : '/apps';
    const redirectTo = returnTo && typeof returnTo === 'string' ? returnTo : defaultRedirect;

    return { redirectTo };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('📅 [Office 365 Calendar] OAuth callback failed', {
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
