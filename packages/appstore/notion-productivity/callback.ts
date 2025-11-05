import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

type NotionTokens = {
  access_token?: string;
  token_type?: string;
  bot_id?: string;
  workspace_name?: string;
  workspace_icon?: string | null;
  workspace_id?: string;
  owner?: any;
};

type NotionCallbackResult = { tokens: NotionTokens; raw?: any; success: boolean };

async function exchangeCode(config: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<NotionCallbackResult> {
  const { code, clientId, clientSecret, redirectUri } = config;
  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  } as const;

  const resp = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion token exchange failed: ${resp.status} ${text}`);
  }

  const json = (await resp.json()) as NotionTokens;
  return { tokens: json, raw: json, success: true };
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

  let state: any = undefined;
  try {
    if (!rawState) throw new Error('State parameter is required for security');
    if (rawState.includes('.')) {
      const [data] = rawState.split('.');
      const decoded = Buffer.from(data, 'base64url').toString('utf-8');
      state = JSON.parse(decoded);
    } else {
      state = JSON.parse(rawState);
    }
    if (!state?.userId) throw new Error('State missing required userId');
    if (state?.timestamp) {
      const age = Date.now() - state.timestamp;
      const maxAge = 10 * 60 * 1000;
      if (age > maxAge) throw new Error('State expired');
    }
  } catch (error) {
    const err: any = new Error(
      error instanceof Error ? error.message : 'Invalid or expired state parameter',
    );
    err.statusCode = 400;
    throw err;
  }

  // Load credentials (DB preferred, fallback to env)
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
    if (typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret;
  } catch {
    // ignore
  }
  if (!clientId) clientId = process.env.NOTION_CLIENT_ID;
  if (!clientSecret) clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId) {
    const err: any = new Error('Notion client_id missing.');
    err.statusCode = 400;
    throw err;
  }
  if (!clientSecret) {
    const err: any = new Error('Notion client_secret missing.');
    err.statusCode = 400;
    throw err;
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  const result = await exchangeCode({ code, clientId, clientSecret, redirectUri });

  // Resolve numeric user id from `sub` or email
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
    // ignore
  }

  const type = meta.slug;

  let emailOrUserName: string | undefined = undefined;
  let avatarUrl: string | undefined = undefined;
  let name: string | undefined = undefined;
  let vendorAccountId: string | undefined = undefined;

  try {
    name = result.tokens.workspace_name;
    vendorAccountId = result.tokens.workspace_id;
    avatarUrl = result.tokens.workspace_icon || undefined;
  } catch {
    // ignore
  }

  await prisma.credential.create({
    data: {
      type,
      key: (result.tokens as any) ?? {},
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

