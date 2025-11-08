import { useEffect, useRef } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { setAccessTokenProvider } from './client';
import { fetchUserMe } from './users';
import { setUserTimeZone } from '@/lib/datetime/format';

export default function ApiAuthProvider() {
  const { getAccessToken, login } = useKindeAuth();
  const reauthRef = useRef(false);

  useEffect(() => {
    // Configure axios client to pull fresh tokens on each request
    setAccessTokenProvider(() => getAccessToken?.());
  }, [getAccessToken]);

  useEffect(() => {
    const expectedAud = (import.meta as any)?.env?.VITE_KINDE_AUDIENCE as string | undefined;
    if (!expectedAud) return;

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

    const checkAudience = async () => {
      if (reauthRef.current) return;
      try {
        const token = await getAccessToken?.();
        if (!token) return;
        const parts = token.split('.');
        if (parts.length < 2) return;
        const payloadRaw = base64UrlDecode(parts[1]);
        const payload = JSON.parse(payloadRaw || '{}');
        const aud: string | string[] | undefined = payload?.aud;
        const matches = Array.isArray(aud) ? aud.includes(expectedAud) : aud === expectedAud;
        if (!matches) {
          reauthRef.current = true;
          await login?.();
        }
      } catch {
        // ignore
      }
    };

    // Run once on mount to ensure audience alignment
    void checkAudience();
  }, [getAccessToken, login]);

  // Fetch user profile to capture preferred timezone and cache it for formatting
  useEffect(() => {
    void (async () => {
      try {
        const me = await fetchUserMe();
        if (me?.timeZone) setUserTimeZone(me.timeZone);
      } catch {
        // non-fatal; fallback to browser timezone
      }
    })();
  }, []);

  // (User sync is triggered directly from KindeProvider onEvent in App.tsx)

  return null;
}
