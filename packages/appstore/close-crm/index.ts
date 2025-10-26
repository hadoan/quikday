import type { AppMeta } from '@quikday/types';

export default function createApp(meta: AppMeta, _deps: any) {
  return new (class CloseCrmApp {
    constructor(public readonly meta: AppMeta) {}

    async add(_req: any, res: any) {
      res.redirect('/integrations/close-crm/auth');
    }

    async callback(_req: any, res: any) {
      res.redirect(`/apps/crm/${meta.slug}`);
    }

    async post(_req: any, res: any) {
      res.status(501).json({ message: 'Not implemented' });
    }
  })(meta);
}

