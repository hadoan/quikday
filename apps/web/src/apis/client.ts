import axios, { AxiosInstance } from 'axios';

export type AccessTokenProvider = () => Promise<string | undefined> | string | undefined;

let accessTokenProvider: AccessTokenProvider | undefined;

export const setAccessTokenProvider = (provider: AccessTokenProvider) => {
  accessTokenProvider = provider;
};

export const getAccessTokenProvider = (): AccessTokenProvider | undefined => accessTokenProvider;

const computeApiBaseUrl = (): string => {
  if (typeof window === 'undefined') return 'http://localhost:3000';
  const fromEnv = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (fromEnv) return fromEnv;
  return `${window.location.protocol}//${window.location.hostname}:3000`;
};

export const getApiBaseUrl = computeApiBaseUrl;

// Compute the Web App base URL (for building returnTo redirects)
const computeWebBaseUrl = (): string => {
  // Prefer explicit webapp base URL if provided
  const envAny = (import.meta as any)?.env as Record<string, unknown> | undefined;
  const explicit = (envAny?.VITE_WEBAPP_BASE_URL as string | undefined) || undefined;
  if (explicit) return explicit.replace(/\/$/, '');

  // Derive from Kinde redirect URI if set (use origin)
  const kin = envAny?.VITE_KINDE_REDIRECT_URI as string | undefined;
  if (kin) {
    try {
      const u = new URL(kin);
      return u.origin;
    } catch {
      // fallthrough
    }
  }

  // Fallback to current origin in browser
  if (typeof window !== 'undefined') return window.location.origin;

  // Final fallback for SSR/dev scripts
  return 'http://localhost:8000';
};

export const getWebBaseUrl = computeWebBaseUrl;

const api: AxiosInstance = axios.create({
  baseURL: computeApiBaseUrl(),
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  try {
    const tokenOrPromise = accessTokenProvider?.();
    const token = tokenOrPromise instanceof Promise ? await tokenOrPromise : tokenOrPromise;
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  } catch {
    // best-effort; proceed without token
  }
  return config;
});

export default api;
export { api };
