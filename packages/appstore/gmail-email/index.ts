/* NOTE: This file contains structure only. Implement provider logic separately. */
import type { AppMeta } from '@quikday/types';
import { resolveGmailAuthUrl } from './add.js';
import { callback } from './callback.js';

// Export Gmail tool for agent use
export * from './tool.js';
export * from './gmail-manager.js';
export * from './GmailManagerConfig.js';
export * from './GmailManagerOptions.js';
export * from './GmailIntegrationValue.js';
export * from './GmailSendEmailOptions.js';
export * from './GmailSendResponse.js';

export default function createApp(meta: AppMeta, deps: any) {
  return new (class GmailApp {
    constructor(
      public readonly meta: AppMeta,
      public readonly deps: any,
    ) {
      console.log('✉️  Gmail app initialized', { slug: meta.slug });
    }

    async add(req: any, res: any) {
      try {
        let signedState: string | undefined;
        if (typeof this.deps?.createSignedState === 'function') {
          try {
            const userId = req?.user?.id || req?.user?.sub;
            if (userId) {
              signedState = this.deps.createSignedState({
                userId,
                timestamp: Date.now(),
                returnTo: req.query?.returnTo,
              });
            }
          } catch (stateError) {
            console.warn('✉️  [Add] Failed to create signed state', {
              error: stateError instanceof Error ? stateError.message : 'Unknown',
            });
          }
        }

        const { url } = await resolveGmailAuthUrl({ req, meta, signedState });

        const acceptsJson =
          (req.headers['accept'] || '').includes('application/json') ||
          req.query?.format === 'json';
        if (acceptsJson) return res.status(200).json({ url });

        res.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('✉️  [Add] Failed to initiate OAuth flow', { error: message });
        res.status(500).json({ error: 'Failed to initiate OAuth flow', message });
      }
    }

    async callback(req: any, res: any) {
      try {
        const { redirectTo } = await callback({ req, meta, prisma: this.deps.prisma });
        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('✉️  [Callback] OAuth callback failed', { error: message });
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    }

    async post(req: any, res: any) {
      const body = req?.body;
      if (!body || typeof body !== 'object')
        return res.status(400).json({ message: 'Invalid body' });
      const now = Date.now();
      return res
        .status(200)
        .json({ ok: true, app: meta.slug, variant: meta.variant, received: body, timestamp: now });
    }
  })(meta, deps);
}
