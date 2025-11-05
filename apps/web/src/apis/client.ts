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
