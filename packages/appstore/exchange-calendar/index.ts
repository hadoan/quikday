/* Exchange Calendar Integration */
import type { AppMeta } from '@quikday/types';
import { resolveExchangeCalendarAuthUrl } from './add.js';
import { callback as exchangeCalendarCallback } from './callback.js';

export { ExchangeCalendarModule } from './exchange-calendar.module.js';
export { ExchangeCalendarProviderService } from './exchange-calendar.service.js';

export default function createApp(meta: AppMeta, deps: any) {
  return {
    // GET /integrations/exchange-calendar/add
    async add(req: any, res: any) {
      try {
        const { url } = await resolveExchangeCalendarAuthUrl({ req, meta });
        const acceptsJson =
          (req.headers['accept'] || '').includes('application/json') ||
          req.query?.format === 'json';
        if (acceptsJson) return res.status(200).json({ url });
        return res.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to initiate setup flow', message });
      }
    },

    // POST /integrations/exchange-calendar/callback
    async callback(req: any, res: any) {
      try {
        const { redirectTo } = await exchangeCalendarCallback({
          req,
          meta,
          prisma: deps?.prisma,
        });
        const acceptsJson =
          (req.headers['accept'] || '').includes('application/json') ||
          req.query?.format === 'json';
        if (acceptsJson) return res.status(200).json({ redirectTo });
        return res.redirect(redirectTo);
      } catch (error) {
        const statusCode = (error as any)?.statusCode || 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(statusCode).json({ error: 'Failed to complete setup', message });
      }
    },

    // Optional POST handler (for form submissions)
    async post(req: any, res: any) {
      // Delegate to callback handler
      return this.callback(req, res);
    },
  };
}
