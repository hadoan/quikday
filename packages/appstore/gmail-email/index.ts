/* Gmail Email Integration */
import type { AppMeta } from '@quikday/types';
import { resolveGmailAuthUrl } from './add.js';
import { callback as gmailCallback } from './callback.js';
import { PrismaService } from '@quikday/prisma';

// Export service for EmailModule compatibility (used by apps/api AppModule)
export { GmailEmailService } from './gmail-email.service.js';

/**
 * Default factory consumed by the API AppStoreRegistry.
 * Must export a default function(meta, deps) that returns an object
 * implementing { add(req,res), callback(req,res), post?(req,res) }.
 */
export default function createApp(meta: AppMeta, deps: any) {
  return new (class GmailEmailApp {
    constructor(public readonly meta: AppMeta, public readonly deps: any) {}

    /**
     * Initiate Gmail OAuth flow
     * Route: GET /integrations/gmail-email/add
     */
    async add(req: any, res: any) {
      const prisma: PrismaService | undefined = this.deps?.prisma;
      try {
        // Build signed OAuth state when available
        let signedState: string | undefined;
        if (typeof this.deps?.createSignedState === 'function') {
          try {
            const userId = req?.user?.id || req?.user?.sub;
            if (userId) {
              signedState = this.deps.createSignedState({
                userId,
                timestamp: Date.now(),
                returnTo: req.query?.returnTo as string | undefined,
              });
            }
          } catch {
            // Fallback to unsigned state inside helper
          }
        }

        const { url } = await resolveGmailAuthUrl({ req, meta, signedState, prisma: prisma as any });

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

    /**
     * Handle Gmail OAuth callback
     * Route: GET /integrations/gmail-email/callback
     */
    async callback(req: any, res: any) {
      try {
        const { redirectTo } = await gmailCallback({ req, meta, prisma: this.deps?.prisma });
        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    }

    // Optional POST endpoint not used yet
    async post(_req: any, res: any) {
      return res.status(404).json({ message: 'Not implemented' });
    }
  })(meta, deps);
}
