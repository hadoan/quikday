/* NOTE: This file contains structure only. Implement provider logic separately. */
import type { AppMeta } from '@quikday/types';
import { extractOAuthParams, buildRedirectUrl } from '@quikday/appstore';

export default function createApp(meta: AppMeta, _deps: any) {
  return new (class MyApp {
    constructor(public readonly meta: AppMeta) {}

    async add(req: any, res: any) {
      // TODO: build provider auth URL, redirect
      // Use env vars only (no secrets committed). See .env.example
      const params = extractOAuthParams(req);
      const redirectUrl = buildRedirectUrl('/TODO-auth-url', {
        run_id: params.runId,
      });
      res.redirect(redirectUrl);
    }

    async callback(req: any, res: any) {
      // TODO: exchange code, upsert credential, pages
      // Example: _deps.prisma.<model>.upsert(...)
      res.redirect(`/apps/${meta.variant}/${meta.slug}`);
    }

    async post(req: any, res: any) {
      // TODO: action (e.g., send post)
      res.status(501).json({ message: 'Not implemented' });
    }
  })(meta);
}
