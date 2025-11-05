import * as hubspot from '@hubspot/api-client';
import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

type HubspotTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  expiry_date?: number; // computed client-side for convenience
};

type HubspotCallbackResult = { tokens: HubspotTokens; raw?: any; success: boolean };

async function exchangeCode(config: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<HubspotCallbackResult> {
  const { code, clientId, clientSecret, redirectUri } = config;
  const hubspotClient = new hubspot.Client();
  try {
    const resp = await hubspotClient.oauth.tokensApi.create(
      'authorization_code',
      code,
      redirectUri,
      clientId,
      clientSecret,
    );

    const tokens: HubspotTokens = {
      access_token: (resp as any)?.accessToken,
      refresh_token: (resp as any)?.refreshToken,
      expires_in: (resp as any)?.expiresIn,
      token_type: (resp as any)?.tokenType,
      scope: (resp as any)?.scope,
    };
    if (typeof tokens.expires_in === 'number') {
      tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
    }
    return { tokens, raw: resp, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`HubSpot token exchange failed: ${message}`);
  }
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
    const err: any = new Error('`code` must be a string');
    err.statusCode = 400;
    throw err;
  }

  // Parse/validate state with signed-first strategy (fallback to legacy unsigned)
  let state: any = undefined;
  let stateValidationMethod = 'none';
  try {
    if (!rawState) throw new Error('State parameter is required for security');
    if (rawState.includes('.')) {
      // signed state format seen; validation should occur in API layer
      const [data] = rawState.split('.');
      const decoded = Buffer.from(data, 'base64url').toString('utf-8');
      state = JSON.parse(decoded);
      stateValidationMethod = 'signed-fallback';
    } else {
      state = JSON.parse(rawState);
      stateValidationMethod = 'unsigned';
      console.warn('⚠️  [HubSpot] Received unsigned state - upgrade to signed state for security');
    }
    if (!state?.userId) throw new Error('State missing required userId field');
    if (state?.timestamp) {
      const age = Date.now() - state.timestamp;
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (age > maxAge) throw new Error(`State expired`);
    }
  } catch (error) {
    const err: any = new Error(
      error instanceof Error ? error.message : 'Invalid or expired state parameter',
    );
    err.statusCode = 400;
    throw err;
  }

  // Resolve credentials
  let clientId: string | undefined = undefined;
  let clientSecret: string | undefined = undefined;
  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
    if (typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret;
  } catch {
    // ignore
  }
  if (!clientId) clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientSecret) clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId) {
    const err: any = new Error('HubSpot client_id missing.');
    err.statusCode = 400;
    throw err;
  }
  if (!clientSecret) {
    const err: any = new Error('HubSpot client_secret missing.');
    err.statusCode = 400;
    throw err;
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  const result = await exchangeCode({ code, clientId, clientSecret, redirectUri });

  // Try to resolve user (create or link)
  let numericUserId: number | undefined;
  try {
    const sub = (req?.user?.sub ??
      (typeof state?.userId === 'string' ? state.userId : undefined)) as string | undefined;
    const email = (req?.user?.email as string | undefined) || undefined;
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
          return tokens.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
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
    console.warn('[HubSpot] Failed to resolve user, saving credential without userId', {
      error: e instanceof Error ? e.message : 'Unknown',
    });
  }

  // Persist credential
  const type = meta.slug; // consistent with other integrations

  let tokenExpiresAt: Date | undefined = undefined;
  if (typeof result.tokens.expiry_date === 'number') {
    tokenExpiresAt = new Date(result.tokens.expiry_date);
  } else if (typeof result.tokens.expires_in === 'number') {
    tokenExpiresAt = new Date(Date.now() + result.tokens.expires_in * 1000);
  }

  await prisma.credential.create({
    data: {
      type,
      key: (result.tokens as any) ?? {},
      ...(typeof numericUserId === 'number' ? { userId: numericUserId } : {}),
      appId: meta.slug,
      ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
    },
  });

  const returnTo = state?.returnTo as string | undefined;
  const defaultWeb = process.env.WEBAPP_URL || process.env.WEBAPP_BASE_URL;
  const defaultRedirect = defaultWeb ? `${defaultWeb.replace(/\/$/, '')}/apps` : '/apps';
  const redirectTo = returnTo && typeof returnTo === 'string' ? returnTo : defaultRedirect;

  return { redirectTo };
}
