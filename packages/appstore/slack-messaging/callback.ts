import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

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
  if (!rawState) {
    const err: any = new Error('`state` is required');
    err.statusCode = 400;
    throw err;
  }

  // Parse state: support signed "data.signature" format and unsigned JSON
  let state: any = undefined;
  try {
    if (rawState.includes('.')) {
      const [data] = rawState.split('.');
      const decoded = Buffer.from(data, 'base64url').toString('utf-8');
      state = JSON.parse(decoded);
    } else {
      state = JSON.parse(rawState);
      console.warn('⚠️  [Slack] Received unsigned state - migrate to signed state for security');
    }

    if (!state?.userId) throw new Error('State missing required userId field');
    if (state?.timestamp) {
      const age = Date.now() - state.timestamp;
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (age > maxAge) throw new Error('State expired');
    }
  } catch (error) {
    const err: any = new Error(
      error instanceof Error ? error.message : 'Invalid or expired state parameter',
    );
    err.statusCode = 400;
    throw err;
  }

  // Resolve Slack credentials
  let clientId: string | undefined = undefined;
  let clientSecret: string | undefined = undefined;
  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
    if (typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret;
  } catch {
    // ignore
  }
  if (!clientId) clientId = process.env.SLACK_CLIENT_ID || process.env.SLACK_ID;
  if (!clientSecret) clientSecret = process.env.SLACK_CLIENT_SECRET || process.env.SLACK_SECRET;
  if (!clientId) {
    const err: any = new Error('Slack client_id missing.');
    err.statusCode = 400;
    throw err;
  }
  if (!clientSecret) {
    const err: any = new Error('Slack client_secret missing.');
    err.statusCode = 400;
    throw err;
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  // Exchange code for tokens
  const tokenResp = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = await tokenResp.json();
  if (!tokenResp.ok || !tokenJson?.ok) {
    const message = tokenJson?.error || tokenJson?.message || 'Slack token exchange failed';
    const err: any = new Error(message);
    err.statusCode = 400;
    throw err;
  }

  // tokenJson example fields: access_token, team, authed_user, scope, token_type, bot_user_id
  let profile: any = undefined;
  try {
    if (tokenJson?.bot_user_id && tokenJson?.access_token) {
      const profResp = await fetch(
        `https://slack.com/api/users.info?user=${encodeURIComponent(tokenJson.bot_user_id)}`,
        { headers: { Authorization: `Bearer ${tokenJson.access_token}` } },
      );
      const profJson = await profResp.json();
      if (profJson?.ok) profile = profJson?.user;
    }
  } catch {
    // ignore profile failures
  }

  // Try to resolve local user
  let numericUserId: number | undefined;
  try {
    const sub = (req?.user?.sub ?? (typeof state?.userId === 'string' ? state.userId : undefined)) as
      | string
      | undefined;
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
  } catch {
    // ignore user resolution errors
  }

  // Prepare credential denormalized fields
  const emailOrUserName: string | undefined = profile?.name || profile?.real_name || undefined;
  const avatarUrl: string | undefined =
    profile?.profile?.image_original || profile?.profile?.image_192 || undefined;
  const name: string | undefined = profile?.real_name || profile?.name || tokenJson?.team?.name;
  const vendorAccountId: string | undefined = tokenJson?.team?.id || undefined;

  await prisma.credential.create({
    data: {
      type: meta.slug,
      key: tokenJson as any,
      ...(typeof numericUserId === 'number' ? { userId: numericUserId } : {}),
      appId: meta.slug,
      ...(emailOrUserName ? { emailOrUserName } : {}),
      ...(name ? { name } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(vendorAccountId ? { vendorAccountId } : {}),
    },
  });

  const returnTo = state?.returnTo as string | undefined;
  const defaultWeb = process.env.WEBAPP_URL || process.env.WEBAPP_BASE_URL;
  const defaultRedirect = defaultWeb ? `${defaultWeb.replace(/\/$/, '')}/apps` : '/apps';
  const redirectTo = returnTo && typeof returnTo === 'string' ? returnTo : defaultRedirect;

  return { redirectTo };
}

