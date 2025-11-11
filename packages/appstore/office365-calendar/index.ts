/* Office 365 Calendar Integration */
import type { AppMeta } from '@quikday/types';
import { resolveOffice365CalendarAuthUrl } from './add.js';
import { callback as office365CalendarCallback } from './callback.js';

export { Office365CalendarModule } from './office365-calendar.module.js';
export { Office365CalendarProviderService } from './office365-calendar.service.js';

export default function createApp(meta: AppMeta, deps: any) {
  return {
    // GET /integrations/office365-calendar/add
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
        const { url } = await resolveOffice365CalendarAuthUrl({
          req,
          meta,
          signedState,
          prisma,
        } as any);
        const acceptsJson =
          (req.headers['accept'] || '').includes('application/json') ||
          req.query?.format === 'json';
        if (acceptsJson) return res.status(200).json({ url });
        return res.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to initiate OAuth flow', message });
      }
    },
    // GET /integrations/office365-calendar/callback
    async callback(req: any, res: any) {
      try {
        const { redirectTo } = await office365CalendarCallback({ req, meta, prisma: deps?.prisma });
        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    },
    // Optional POST not used yet
    async post(_req: any, res: any) {
      return res.status(404).json({ message: 'Not implemented' });
    },
  };
}
