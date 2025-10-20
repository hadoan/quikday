/* Google Calendar Integration */
import type { AppMeta } from '@quikday/types';
import { resolveGoogleCalendarAuthUrl } from './add.js';
import { callback } from './callback.js';

export default function createApp(meta: AppMeta, deps: any) {
  return new (class GoogleCalendarApp {
    constructor(public readonly meta: AppMeta, public readonly deps: any) {
      console.log('📅 Google Calendar app initialized', { slug: meta.slug });
    }

    /**
     * Initiate OAuth flow
     * Called when user clicks "Install" on Google Calendar
     * Route: GET /integrations/google-calendar/add
     */
    async add(req: any, res: any) {
      try {
        console.log('📅 [Add] Initiating OAuth flow', {
          slug: meta.slug,
          userId: req?.user?.id || req?.user?.sub,
        });
        
        // Delegate all logic to add.ts helper
        const { url } = await resolveGoogleCalendarAuthUrl({ req, meta });
        
        console.log('📅 [Add] OAuth URL generated, redirecting user', {
          hasUrl: !!url,
        });
        
        // If client requested JSON (e.g., to attach Authorization header), return the URL
        const acceptsJson = (req.headers['accept'] || '').includes('application/json') || req.query?.format === 'json';
        if (acceptsJson) {
          return res.status(200).json({ url });
        }
        
        res.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('📅 [Add] Failed to initiate OAuth flow', {
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        res.status(500).json({ error: 'Failed to initiate OAuth flow', message });
      }
    }

    async callback(req: any, res: any) {
      console.log('📅 [Callback] Handling OAuth callback', {
        slug: meta.slug,
        hasCode: !!req.query?.code,
        hasError: !!req.query?.error,
      });
      
      try {
        const { redirectTo } = await callback({ 
          req, 
          meta, 
          prisma: this.deps.prisma,
        });
        
        console.log('📅 [Callback] OAuth callback completed, redirecting', {
          redirectTo,
        });
        
        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('📅 [Callback] OAuth callback failed', {
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    }

    async post(req: any, res: any) {
      console.log('📅 [Post] Received POST request', {
        slug: meta.slug,
        hasBody: !!req?.body,
      });
      
      const body = req?.body;

      if (!body || typeof body !== 'object') {
        console.warn('📅 [Post] Invalid request body', {
          bodyType: typeof body,
        });
        return res.status(400).json({ message: 'Invalid body' });
      }

      const now = Date.now();
      console.log('📅 [Post] Request processed successfully', {
        timestamp: now,
      });
      
      return res.status(200).json({
        ok: true,
        app: meta.slug,
        variant: meta.variant,
        received: body,
        timestamp: now,
      });
    }
  })(meta, deps);
}
