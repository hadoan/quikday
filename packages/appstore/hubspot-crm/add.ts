import * as hubspot from '@hubspot/api-client';
import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';

type HubspotAuthUrlResult = { url: string; scopes: string[] };

// Minimum scopes for contacts + meetings + associations
const HUBSPOT_SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.meetings.read',
  'crm.objects.meetings.write',
  'crm.objects.associations.read',
  'crm.objects.associations.write',
];

export async function resolveHubspotAuthUrl(params: {
  req: any;
  meta: AppMeta;
  signedState?: string;
  prisma?: any;
}): Promise<HubspotAuthUrlResult> {
  const { req, meta, signedState, prisma } = params;

  let clientId: string | undefined = undefined;
  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
  } catch {
    // ignore DB lookup failures
  }

  if (!clientId) clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) throw new Error('HubSpot OAuth credentials not configured: client_id missing');

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  // Prefer signed state; fallback to unsigned JSON (back-compat)
  let state: string;
  if (signedState) {
    state = signedState;
  } else {
    const userId = req.user?.id || req.user?.sub;
    state = JSON.stringify({ userId, timestamp: Date.now() });
    console.warn('⚠️  Using unsigned OAuth state for HubSpot');
  }

  const hubspotClient = new hubspot.Client();
  const url = hubspotClient.oauth.getAuthorizationUrl(
    clientId,
    redirectUri,
    HUBSPOT_SCOPES.join(' '),
    undefined, // accountId (optional)
    state,
  );

  return { url, scopes: HUBSPOT_SCOPES };
}
