import type { AppMeta } from '@quikday/types';

export const normalizeMetadata = (m: Partial<AppMeta>): AppMeta => ({
  name: m.name ?? m.slug ?? 'unnamed',
  description: m.description,
  type: m.type ?? 'oauth2',
  title: m.title ?? m.name ?? 'Untitled',
  variant: m.variant ?? 'other',
  categories: m.categories ?? [],
  logo: m.logo,
  publisher: m.publisher,
  slug: m.slug ?? 'unknown',
  dirName: m.dirName ?? m.slug ?? 'unknown',
  email: m.email,
  url: m.url,
  installed: m.installed ?? false,
});

