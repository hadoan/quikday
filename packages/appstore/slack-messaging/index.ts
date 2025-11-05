import type { AppMeta } from '@quikday/types';
import { resolveSlackAuthUrl } from './add.js';
import { callback as slackCallback } from './callback.js';

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
        // Resolve numeric user id from req.user (Kinde)
        const sub: string | undefined = (req?.user?.sub || req?.user?.id) as string | undefined;
        if (!sub) return res.status(401).json({ error: 'Unauthorized' });

        const prisma: any = deps?.prisma;
        const user = await prisma.user.findUnique({ where: { sub } });
        if (!user) return res.status(401).json({ error: 'User not found' });

        // Resolve a recent valid credential for this user/app
        const latest = await prisma.credential.findFirst({
          where: { userId: user.id, invalid: false, appId: meta.slug },
          orderBy: { updatedAt: 'desc' },
        });
        const token: string | undefined = (() => {
          if (!latest) return undefined;
          const key = latest.key as any;
          if (key?.access_token && typeof key.access_token === 'string') return key.access_token;
          if (key?.token?.access_token && typeof key.token.access_token === 'string')
            return key.token.access_token;
          return undefined;
        })();
        if (!token) return res.status(400).json({ error: 'Missing Slack credential for user' });

        const body = req.body || {};
        const channel = (body.channel || body.settings?.channel) as string | undefined;
        const text = (body.text || body.message) as string | undefined;
        const blocks = body.blocks as any[] | undefined;
        const thread_ts = body.thread_ts as string | undefined;

        if (!channel) return res.status(400).json({ error: '`channel` is required' });
        if (!text && !Array.isArray(blocks))
          return res.status(400).json({ error: 'Either `text` or `blocks` is required' });

        // Best-effort join (public channels). Ignored on failure.
        try {
          await fetch('https://slack.com/api/conversations.join', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ channel }),
          });
        } catch {}

        const postResp = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel,
            text: text || undefined,
            ...(Array.isArray(blocks) ? { blocks } : {}),
            ...(thread_ts ? { thread_ts } : {}),
          }),
        });
        const json = await postResp.json();
        if (!json?.ok) {
          return res.status(400).json({ error: json?.error || 'Slack post failed', details: json });
        }
        return res.status(200).json(json);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to post to Slack', message });
      }
    }
  })(meta);
}
