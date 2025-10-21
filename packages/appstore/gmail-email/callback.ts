import { google } from 'googleapis';
import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';
import { GmailCallbackConfig } from './GmailCallbackConfig.js';
import { GmailTokens } from './GmailTokens.js';
import { GmailCallbackResult } from './GmailCallbackResult.js';

export async function exchangeCode(config: GmailCallbackConfig): Promise<GmailCallbackResult> {
  const { code, clientId, clientSecret, redirectUri } = config;

  if (!code) throw new Error('Gmail: authorization code is required');
  if (!clientId) throw new Error('Gmail: client_id is required');
  if (!clientSecret) throw new Error('Gmail: client_secret is required');
  if (!redirectUri) throw new Error('Gmail: redirect_uri is required');

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const tokenResponse = await oAuth2Client.getToken(code);

    const tokens: GmailTokens = {
      access_token: tokenResponse.tokens.access_token,
      refresh_token: tokenResponse.tokens.refresh_token,
      scope: tokenResponse.tokens.scope,
      token_type: tokenResponse.tokens.token_type,
      expiry_date: tokenResponse.tokens.expiry_date,
      id_token: tokenResponse.tokens.id_token,
    };

    return { tokens, raw: tokenResponse.res?.data || tokenResponse.tokens, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Gmail token exchange failed: ${message}`);
  }
}

export function validateGmailTokens(tokens: GmailTokens): boolean {
  const hasAccessToken = !!tokens.access_token;
  const hasRefreshToken = !!tokens.refresh_token;
  return hasAccessToken || hasRefreshToken;
}

export function isTokenExpired(tokens: GmailTokens, bufferMs = 5 * 60 * 1000): boolean {
  if (!tokens.expiry_date) return true;
  const now = Date.now();
  const expiryWithBuffer = tokens.expiry_date - bufferMs;
  return now >= expiryWithBuffer;
}

export async function refreshToken(config: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GmailCallbackResult> {
  const { refreshToken, clientId, clientSecret } = config;
  if (!refreshToken) throw new Error('Gmail: refresh_token is required');
  if (!clientId) throw new Error('Gmail: client_id is required');
  if (!clientSecret) throw new Error('Gmail: client_secret is required');

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    const tokenResponse = await oAuth2Client.refreshAccessToken();

    const tokens: GmailTokens = {
      access_token: tokenResponse.credentials.access_token,
      refresh_token: tokenResponse.credentials.refresh_token || refreshToken,
      scope: tokenResponse.credentials.scope,
      token_type: tokenResponse.credentials.token_type,
      expiry_date: tokenResponse.credentials.expiry_date,
      id_token: tokenResponse.credentials.id_token,
    };

    return { tokens, raw: tokenResponse.res?.data || tokenResponse.credentials, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Gmail token refresh failed: ${message}`);
  }
}

export async function callback(params: { req: any; meta: AppMeta; prisma: any }): Promise<{ redirectTo: string }> {
  const { req, meta, prisma } = params;

  const code = typeof req.query?.code === 'string' ? req.query.code : undefined;
  const rawState = typeof req.query?.state === 'string' ? req.query.state : undefined;

  if (!code) {
    const err: any = new Error('`code` must be a string');
    err.statusCode = 400;
    throw err;
  }

  // Parse state (signed handling omitted; fallback to unsigned)
  let state: any = undefined;
  try {
    if (!rawState) throw new Error('State parameter is required for security');
    if (rawState.includes('.')) {
      const [data] = rawState.split('.');
      const decoded = Buffer.from(data, 'base64url').toString('utf-8');
      state = JSON.parse(decoded);
    } else {
      state = JSON.parse(rawState);
      console.warn('⚠️  [Gmail] Received unsigned state - upgrade to signed state for security');
    }

    if (!state?.userId) throw new Error('State missing required userId field');
    if (state?.timestamp) {
      const age = Date.now() - state.timestamp;
      const maxAge = 10 * 60 * 1000;
      if (age > maxAge) throw new Error(`State expired`);
    }
  } catch (error) {
    const err: any = new Error(error instanceof Error ? error.message : 'Invalid or expired state parameter');
    err.statusCode = 400;
    throw err;
  }

  // Load credentials (DB preferred, fallback to env)
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  try {
    const appKeys = (await getAppKeysFromSlug(meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
    if (typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret;
  } catch (e) {
    // ignore
  }

  if (!clientId) {
    const err: any = new Error('Gmail client_id missing.');
    err.statusCode = 400;
    throw err;
  }
  if (!clientSecret) {
    const err: any = new Error('Gmail client_secret missing.');
    err.statusCode = 400;
    throw err;
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  try {
    const result = await exchangeCode({ code, clientId, clientSecret, redirectUri });

    // Try to resolve user
    let numericUserId: number | undefined;
    try {
      const sub = (req?.user?.sub ?? (typeof state?.userId === 'string' ? state.userId : undefined)) as string | undefined;
      const email = (req?.user?.email as string | undefined) || undefined;
      const displayName = (req?.user?.name as string | undefined) || undefined;

      if (sub) {
        const user = await prisma.user.upsert({ where: { sub }, update: {}, create: { sub, email: email || null, displayName: displayName || null } });
        numericUserId = user.id;
      } else if (email) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) numericUserId = existing.id;
      }
    } catch (e) {
      console.warn('[Gmail] Failed to resolve user, saving credential without userId', { error: e instanceof Error ? e.message : 'Unknown' });
    }

    const type = meta.slug;

    // Attempt to extract user info from id_token (JWT) or tokens
    let emailOrUserName: string | undefined = undefined;
    let avatarUrl: string | undefined = undefined;
    let name: string | undefined = undefined;
    let vendorAccountId: string | undefined = undefined;
    let tokenExpiresAt: Date | undefined = undefined;

    try {
      const idToken = result.tokens.id_token;
      if (idToken && typeof idToken === 'string') {
        const parts = idToken.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
          if (payload?.email) emailOrUserName = payload.email;
          if (payload?.name) name = payload.name;
          if (payload?.picture) avatarUrl = payload.picture;
          if (payload?.sub) vendorAccountId = payload.sub;
        }
      }

      if (!tokenExpiresAt && result.tokens.expiry_date) {
        tokenExpiresAt = new Date(result.tokens.expiry_date);
      }
    } catch (e) {
      // ignore parsing errors
    }

    await prisma.credential.create({
      data: {
        type,
        key: result.tokens as any,
        ...(typeof numericUserId === 'number' ? { userId: numericUserId } : {}),
        appId: meta.slug,
        ...(emailOrUserName ? { emailOrUserName } : {}),
        ...(name ? { name } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(vendorAccountId ? { vendorAccountId } : {}),
        ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
      },
    });

    const returnTo = state?.returnTo as string | undefined;
    const redirectTo = returnTo && typeof returnTo === 'string' ? returnTo : `/apps/${meta.variant}/${meta.slug}`;

    return { redirectTo };
  } catch (error) {
    throw error;
  }
}
