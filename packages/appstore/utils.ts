export const getAppAssetFullPath = (dirName: string, assetPath: string) => {
  if (!assetPath) return '';
  if (/^https?:\/\//.test(assetPath)) return assetPath;
  if (assetPath.startsWith('/')) return assetPath;
  return `/app-store/${dirName}/${assetPath}`;
};

export const hideKeysForFrontend = (keys?: Record<string, unknown>) => {
  if (!keys) return undefined;
  const safe: Record<string, string> = {};
  for (const k of Object.keys(keys)) {
    safe[k] = '***';
  }
  return safe;
};

/**
 * Extract OAuth-related parameters from request query
 * Returns common parameters used in OAuth flows (returnTo, etc.)
 */
export interface OAuthParams {
  returnTo?: string;
}

export const extractOAuthParams = (req: any): OAuthParams => {
  return {
    returnTo: req.query?.returnTo as string | undefined,
  };
};

/**
 * Build a redirect URL with query parameters preserved
 * @param baseUrl - The base URL to redirect to
 * @param params - Query parameters to append
 * @returns URL string with encoded query parameters
 */
export const buildRedirectUrl = (baseUrl: string, params?: Record<string, string | undefined>) => {
  if (!params) return baseUrl;

  const queryParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
    .join('&');

  return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
};

/**
 * Create signed state object with common OAuth parameters
 * Helper for building state objects passed to createSignedState
 */
export const buildOAuthState = (userId: string, params: OAuthParams) => {
  return {
    userId,
    timestamp: Date.now(),
    ...(params.returnTo && { returnTo: params.returnTo }),
  };
};
