import axios, { AxiosInstance } from 'axios';

export type AccessTokenProvider = () => Promise<string | undefined> | string | undefined;

let accessTokenProvider: AccessTokenProvider | undefined;

export const setAccessTokenProvider = (provider: AccessTokenProvider) => {
  accessTokenProvider = provider;
};

export const getAccessTokenProvider = (): AccessTokenProvider | undefined => accessTokenProvider;

const DEV_API_BASE_URL = 'http://localhost:3000';
const PROD_API_BASE_URL = 'https://api.quik.day';

const sanitizeBaseUrl = (value?: string): string | undefined =>
  value ? value.replace(/\/+$/, '') : undefined;

const computeApiBaseUrl = (): string => {
  const envAny = (import.meta as any)?.env as Record<string, unknown> | undefined;
  const fromEnv = sanitizeBaseUrl(envAny?.VITE_API_BASE_URL as string | undefined);
  if (fromEnv) return fromEnv;

  if (typeof window === 'undefined') return DEV_API_BASE_URL;

  const hostname = window.location.hostname;
  const lowerHost = hostname?.toLowerCase?.() ?? '';
  if (
    lowerHost === 'localhost' ||
    lowerHost === '127.0.0.1' ||
    lowerHost === '[::1]' ||
    lowerHost.endsWith('.local')
  ) {
    return `${window.location.protocol}//${hostname}:3000`;
  }

  return PROD_API_BASE_URL;
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
