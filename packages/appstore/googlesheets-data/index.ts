import type { AppMeta } from '@quikday/types';
import { extractOAuthParams, buildRedirectUrl } from '@quikday/appstore';

export default function createApp(meta: AppMeta, _deps: any) {
  return new (class GoogleSheetsApp {
    constructor(public readonly meta: AppMeta) {}
    async add(req: any, res: any) {
      const params = extractOAuthParams(req);
      const redirectUrl = buildRedirectUrl('/integrations/googlesheets-data/auth', {
        returnTo: params.returnTo,
      });
      res.redirect(redirectUrl);
    }
    async callback(_req: any, res: any) {
      res.redirect(`/apps/automation/${meta.slug}`);
    }
    async post(_req: any, res: any) {
      res.status(501).json({ message: 'Not implemented' });
    }
  })(meta);
}
