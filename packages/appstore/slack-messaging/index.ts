import type { AppMeta } from '@quikday/types';

export default function createApp(meta: AppMeta, _deps: any) {
  return new (class SlackApp {
    constructor(public readonly meta: AppMeta) {}
    async add(_req: any, res: any) { res.redirect('/integrations/slack-messaging/auth'); }
    async callback(_req: any, res: any) { res.redirect(`/apps/automation/${meta.slug}`); }
    async post(_req: any, res: any) { res.status(501).json({ message: 'Not implemented' }); }
  })(meta);
}

