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

