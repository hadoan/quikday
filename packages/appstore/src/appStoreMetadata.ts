export type AppMeta = {
  name: string;
  description?: string;
  type?: string;
  title?: string;
  variant?: string;
  categories?: string[];
  logo?: string;
  publisher?: string;
  slug: string;
  dirName?: string;
  email?: string;
  url?: string;
};

export const normalizeMetadata = (m: Partial<AppMeta>): AppMeta => ({
  name: m.name ?? m.slug ?? 'unnamed',
  description: m.description,
  type: m.type,
  title: m.title,
  variant: m.variant,
  categories: m.categories ?? [],
  logo: m.logo,
  publisher: m.publisher,
  slug: m.slug ?? 'unknown',
  dirName: m.dirName ?? m.slug,
  email: m.email,
  url: m.url,
});
