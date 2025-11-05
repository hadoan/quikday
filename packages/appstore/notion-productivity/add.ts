import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

type NotionAuthUrlResult = { url: string };

export async function resolveNotionAuthUrl(params: {
  req: any;
  meta: AppMeta;
  signedState?: string;
  prisma?: any;
}): Promise<NotionAuthUrlResult> {
  const { req, meta, signedState, prisma } = params;

  let clientId: string | undefined;
  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
  } catch {
    // ignore DB lookup failures
  }

  if (!clientId) clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) throw new Error('Notion OAuth credentials not configured: client_id missing');

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  const state = signedState
    ? signedState
    : JSON.stringify({
        userId: req.user?.id || req.user?.sub,
        timestamp: Date.now(),
        returnTo: req.query?.returnTo as string | undefined,
      });

  const paramsObj = new URLSearchParams();
  paramsObj.set('client_id', clientId);
  paramsObj.set('response_type', 'code');
  paramsObj.set('owner', 'user');
  paramsObj.set('redirect_uri', redirectUri);
  paramsObj.set('state', state);

  const url = `https://api.notion.com/v1/oauth/authorize?${paramsObj.toString()}`;
  return { url };
}

