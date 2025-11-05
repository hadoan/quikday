import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

type SlackAuthUrlResult = { url: string; scopes: string[] };

// Reasonable default scopes for messaging use-cases
const SLACK_SCOPES = [
  'channels:read',
  'chat:write',
  'users:read',
  'groups:read',
  'channels:join',
  'chat:write.customize',
];

export function generateSlackAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): SlackAuthUrlResult {
  const { clientId, redirectUri, state } = params;
  if (!clientId) throw new Error('Slack: client_id is required');
  if (!redirectUri) throw new Error('Slack: redirect_uri is required');
  if (!state) throw new Error('Slack: state is required');

  const scope = encodeURIComponent(SLACK_SCOPES.join(','));
  const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(
    clientId,
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(
    state,
  )}`;

  return { url, scopes: SLACK_SCOPES };
}

export async function resolveSlackAuthUrl(params: {
  req: any;
  meta: AppMeta;
  signedState?: string;
  prisma?: any;
}): Promise<SlackAuthUrlResult> {
  const { req, meta, signedState, prisma } = params;

  // Resolve clientId from DB (preferred) or env as fallback
  let clientId: string | undefined;
  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
  } catch {
    // ignore DB lookup errors
  }
  if (!clientId) clientId = process.env.SLACK_CLIENT_ID || process.env.SLACK_ID;

  if (!clientId) {
    throw new Error('Slack OAuth credentials not configured: client_id missing');
  }

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  // Prefer signed state from API; fallback to unsigned JSON for backwards-compat
  let state: string;
  if (signedState) {
    state = signedState;
  } else {
    const userId = req.user?.id || req.user?.sub;
    state = JSON.stringify({ userId, timestamp: Date.now() });
    console.warn('⚠️  Using unsigned OAuth state for Slack');
  }

  return generateSlackAuthUrl({ clientId, redirectUri, state });
}

