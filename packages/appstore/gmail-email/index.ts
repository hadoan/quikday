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
      res.redirect('/TODO-auth-url');
    }

    async callback(req: any, res: any) {
      // TODO: exchange code, upsert credential, labels, etc.
      res.redirect(`/apps/${meta.variant}/${meta.slug}`);
    }

    async post(req: any, res: any) {
      // TODO: action (e.g., send email)
      res.status(501).json({ message: 'Not implemented' });
    }
  })();
}

