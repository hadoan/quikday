import type { AppMeta } from '@quikday/types';

export type AppRow = {
  slug: string;
  dirName: string;
  categories?: string[];
  enabled?: boolean;
  keys?: Record<string, unknown>;
};

export type AppWithMeta = AppRow & { metadata?: AppMeta };

// Minimal in-memory registry for restoration/demo purposes.
const LOCAL_APPS: Record<string, AppWithMeta> = {};

export function registerLocalApp(app: AppWithMeta) {
  LOCAL_APPS[app.slug] = app;
}

export function listLocalApps(): AppWithMeta[] {
  return Object.values(LOCAL_APPS);
}

export function getLocalApp(slug: string): AppWithMeta | undefined {
  return LOCAL_APPS[slug];
}

