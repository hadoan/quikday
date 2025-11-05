/* HubSpot CRM Integration */
import type { AppMeta } from '@quikday/types';
import { resolveHubspotAuthUrl } from './add.js';
import { callback as hubspotCallback } from './callback.js';

// Export Nest module/service for potential consumption
export { HubspotCrmModule } from './hubspot-crm.module.js';
export { HubspotCrmService } from './hubspot-crm.service.js';

export default function createApp(meta: AppMeta, deps: any) {
  return {
    // GET /integrations/hubspot-crm/add
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

        const { url } = await resolveHubspotAuthUrl({ req, meta, signedState, prisma } as any);
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
    // GET /integrations/hubspot-crm/callback
    async callback(req: any, res: any) {
      try {
        const { redirectTo } = await hubspotCallback({ req, meta, prisma: deps?.prisma });
        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    },
    async post(_req: any, res: any) {
      return res.status(404).json({ message: 'Not implemented' });
    },
  };
}
