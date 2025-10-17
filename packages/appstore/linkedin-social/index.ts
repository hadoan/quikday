/* NOTE: This file contains structure only. Implement provider logic separately. */
import type { AppMeta } from '@runfast/types/App';
import { BaseApp } from '../../../../apps/api/src/integrations/app.base';
import type { AppDeps } from '../../../../apps/api/src/integrations/app.types';

export default function createApp(meta: AppMeta, deps: AppDeps) {
  return new (class MyApp extends BaseApp {
    constructor() {
      super(meta);
    }

    async add(req: any, res: any) {
      // TODO: build provider auth URL, redirect
      // Use env vars only (no secrets committed). See .env.example
      res.redirect('/TODO-auth-url');
    }

    async callback(req: any, res: any) {
      // TODO: exchange code, upsert credential, pages
      // Example: deps.prisma.<model>.upsert(...)
      res.redirect(`/apps/${meta.variant}/${meta.slug}`);
    }

    async post(req: any, res: any) {
      // TODO: action (e.g., send post)
      res.status(501).json({ message: 'Not implemented' });
    }
  })();
}
