import type { AppMeta } from '@quikday/types';

export default function createApp(meta: AppMeta, _deps: any) {
  return new (class GitHubApp {
    constructor(public readonly meta: AppMeta) {}
    async add(_req: any, res: any) {
      res.redirect('/integrations/github-devtools/auth');
    }
    async callback(_req: any, res: any) {
      res.redirect(`/apps/other/${meta.slug}`);
    }
    async post(_req: any, res: any) {
      res.status(501).json({ message: 'Not implemented' });
    }
  })(meta);
}
