import api from './client';

type GetAccessToken = () => Promise<string | undefined>;

const base64UrlDecode = (str: string) => {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  try {
    return atob(s);
  } catch {
    return '';
  }
};

async function waitForAudienceToken(getAccessToken: GetAccessToken, expectedAud?: string, tries = 10, delayMs = 150): Promise<string | undefined> {
  for (let i = 0; i < tries; i++) {
    try {
      const tok = await getAccessToken();
      if (!tok) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      if (!expectedAud) return tok;
      const parts = tok.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}');
        const aud = payload?.aud;
        const ok = Array.isArray(aud) ? aud.includes(expectedAud) : aud === expectedAud;
        if (ok) return tok;
      }
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return undefined;
}

export async function syncUserAfterRegister(params: {
  getAccessToken: GetAccessToken;
  expectedAudience?: string;
  tries?: number;
  delayMs?: number;
}) {
  const { getAccessToken, expectedAudience, tries, delayMs } = params;
  console.log('[syncUser] Ensuring token audience then syncing user');
  const tok = await waitForAudienceToken(getAccessToken, expectedAudience, tries, delayMs);
  if (!tok) {
    console.warn('[syncUser] Could not obtain access token with expected audience; skipping sync');
    return;
  }
  try {
    await api.post('/users/sync');
    console.log('[syncUser] /users/sync success');
  } catch (err) {
    console.warn('[syncUser] /users/sync failed', err);
  }
}

