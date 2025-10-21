declare module '@quikday/appstore' {
  export function getAppKeysFromSlug(slug: string): Promise<Record<string, unknown> | undefined>;
}
