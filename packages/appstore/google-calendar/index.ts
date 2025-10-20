/* Google Calendar Integration */
import type { AppMeta } from '@quikday/types';
import { resolveGoogleCalendarAuthUrl } from './add.js';

export default function createApp(meta: AppMeta, _deps: any) {
  return new (class GoogleCalendarApp {
    constructor(public readonly meta: AppMeta) {}

    /**
     * Initiate OAuth flow
     * Called when user clicks "Install" on Google Calendar
     * Route: GET /integrations/google-calendar/add
     */
    async add(req: any, res: any) {
      try {
        // Delegate all logic to add.ts helper
        const { url } = await resolveGoogleCalendarAuthUrl({ req, meta });
        res.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to initiate OAuth flow', message });
      }
    }

    async callback(req: any, res: any) {
      // TODO: exchange code, upsert credential, pages
      // Example: _deps.prisma.<model>.upsert(...)
      res.redirect(`/apps/${meta.variant}/${meta.slug}`);
    }

    async post(req: any, res: any) {
      const body = req?.body;

      if (!body || typeof body !== 'object') {
        return res.status(400).json({ message: 'Invalid body' });
      }

      const now = Date.now();
      return res.status(200).json({
        ok: true,
        app: meta.slug,
        variant: meta.variant,
        received: body,
        timestamp: now,
      });
    }
  })(meta);
}
