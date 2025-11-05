import type { AppMeta } from '@quikday/types';
import { resolveSlackAuthUrl } from './add.js';
import { callback as slackCallback } from './callback.js';
export { SlackMessagingModule } from './slack-messaging.module.js';
export { SlackMessagingService } from './slack-messaging.service.js';

export default function createApp(meta: AppMeta, deps: any) {
  return new (class SlackApp {
    constructor(public readonly meta: AppMeta) {}

    // GET /integrations/slack-messaging/add
    async add(req: any, res: any) {
      const prisma: any = deps?.prisma;
      try {
        let signedState: string | undefined;
        if (typeof deps?.createSignedState === 'function') {
          try {
            const userId = req?.user?.id || req?.user?.sub;
            if (userId) {
              signedState = deps.createSignedState({
                userId,
                timestamp: Date.now(),
                returnTo: req.query?.returnTo as string | undefined,
              });
            }
          } catch {
            // ignore
          }
        }

        const { url } = await resolveSlackAuthUrl({ req, meta, signedState, prisma });
        const acceptsJson =
          (req.headers['accept'] || '').includes('application/json') ||
          req.query?.format === 'json';
        if (acceptsJson) return res.status(200).json({ url });
        return res.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to initiate OAuth flow', message });
      }
    }

    // GET /integrations/slack-messaging/callback
    async callback(req: any, res: any) {
      try {
        const { redirectTo } = await slackCallback({ req, meta, prisma: deps?.prisma });
        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    }

    // POST /integrations/slack-messaging/post
    async post(req: any, res: any) {
      try {
        const m = await import('./slack-messaging.service.js');
        const currentUserShim = {
          getCurrentUserSub: () => (req?.user?.sub || req?.user?.id || null) as string | null,
        } as any;
        const svc = new m.SlackMessagingService(deps?.prisma, currentUserShim);
        const body = req.body || {};
        const channel = (body.channel || body.settings?.channel) as string | undefined;
        const text = (body.text || body.message) as string | undefined;
        const thread_ts = body.thread_ts as string | undefined;
        if (!channel) return res.status(400).json({ error: '`channel` is required' });
        if (!text) return res.status(400).json({ error: '`text` is required' });
        const result = await svc.postMessage({ channel, text, thread_ts });
        return res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to post to Slack', message });
      }
    }
  })(meta);
}
