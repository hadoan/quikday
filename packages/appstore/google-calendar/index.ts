/* Google Calendar Integration */
import type { AppMeta } from '@quikday/types';
import { generateGoogleCalendarAuthUrl } from './add.js';

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
        // Get OAuth credentials from environment variables
        // TODO: In production, fetch from secure config/key management service
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          return res.status(500).json({
            error: 'Google Calendar OAuth credentials not configured',
            message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables',
          });
        }

        // Build redirect URI (convention: {baseUrl}/integrations/{slug}/callback)
        const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const redirectUri = `${baseUrl}/integrations/${meta.slug}/callback`;

        // Encode state for CSRF protection and user context
        // In production: use signed JWT or encrypted state
        const state = JSON.stringify({
          userId: req.user?.id || req.user?.sub,
          timestamp: Date.now(),
        });

        // Generate OAuth URL using library function
        const { url } = generateGoogleCalendarAuthUrl({
          clientId,
          clientSecret,
          redirectUri,
          state,
        });

        // Redirect user to Google OAuth consent screen
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
