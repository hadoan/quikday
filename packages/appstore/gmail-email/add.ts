import { google } from 'googleapis';
import type { AppMeta } from '@quikday/types';
import { getAppKeysFromSlug } from '@quikday/appstore';
import { GmailAuthConfig } from './GmailAuthConfig.js';
import { GmailAuthUrlResult } from './GmailAuthUrlResult.js';
import { PrismaService } from '@quikday/prisma';

// Scopes needed for full Gmail integration functionality
// - gmail.send: Send messages
// - gmail.compose: Create/send drafts, read messages
// - gmail.modify: Modify labels (archive, snooze, categorize)
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
];

export function generateGmailAuthUrl(config: GmailAuthConfig): GmailAuthUrlResult {
  const { clientId, clientSecret, redirectUri, state } = config;

  if (!clientId) throw new Error('Gmail: client_id is required');
  if (!clientSecret) throw new Error('Gmail: client_secret is required');
  if (!redirectUri) throw new Error('Gmail: redirect_uri is required');

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    ...(state && { state }),
  });

  return { url, scopes: GMAIL_SCOPES };
}

export async function resolveGmailAuthUrl(params: {
  req: any;
  meta: AppMeta;
  prisma: PrismaService;
  signedState?: string;
}): Promise<GmailAuthUrlResult> {
  const { req, meta, signedState, prisma } = params;

  let clientId: string | undefined;
  let clientSecret: string | undefined;

  try {
    const appKeys = (await getAppKeysFromSlug(prisma, meta.slug)) as Record<string, unknown>;
    if (typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
    if (typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret;
  } catch {
    // ignore
  }

  if (!clientId) throw new Error('Gmail OAuth credentials not configured: client_id missing');
  if (!clientSecret)
    throw new Error('Gmail OAuth credentials not configured: client_secret missing');

  const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

  let state: string;
  if (signedState) {
    state = signedState;
  } else {
    const userId = req.user?.id || req.user?.sub;
    state = JSON.stringify({ userId, timestamp: Date.now() });
    console.warn(
      '⚠️  Using unsigned OAuth state - consider using signed state for better security',
    );
  }

  return generateGmailAuthUrl({ clientId, clientSecret, redirectUri, state });
}
