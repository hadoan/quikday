import type { AppMeta } from '@quikday/types';
import { resolveNotionAuthUrl } from './add.js';
import { callback as notionCallback } from './callback.js';

// Export service/module in case tools want to resolve via ModuleRef
export { NotionProductivityService } from './notion-productivity.service.js';
export { NotionProductivityModule } from './notion-productivity.module.js';

export default function createApp(meta: AppMeta, deps: any) {
  return new (class NotionApp {
    constructor(public readonly meta: AppMeta) {}

    // GET /integrations/notion-productivity/add
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

        const { url } = await resolveNotionAuthUrl({ req, meta, signedState, prisma });
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

    // GET /integrations/notion-productivity/callback
    async callback(req: any, res: any) {
      try {
        const { redirectTo } = await notionCallback({ req, meta, prisma: deps?.prisma });
        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    }

    // POST /integrations/notion-productivity/post
    async post(req: any, res: any) {
      try {
        const m = await import('./notion-productivity.service.js');
        const currentUserShim =
          deps?.currentUserService ??
          ({
            getCurrentUserSub: () => (req?.user?.sub || req?.user?.id || null) as string | null,
          } as any);
        const svc = new m.NotionProductivityService(deps?.prisma, currentUserShim);

        const body = req.body || {};
        const action = (body.action || 'createPage') as string;

        if (action === 'createPage') {
          const databaseId = body.databaseId as string | undefined;
          const properties = body.properties as Record<string, any> | undefined;
          const children = body.children as any[] | undefined;
          if (!databaseId) return res.status(400).json({ error: '`databaseId` is required' });
          if (!properties) return res.status(400).json({ error: '`properties` is required' });
          const result = await svc.createPage({ databaseId, properties, children });
          return res.status(200).json(result);
        }

        if (action === 'updatePage') {
          const pageId = body.pageId as string | undefined;
          const properties = body.properties as Record<string, any> | undefined;
          if (!pageId) return res.status(400).json({ error: '`pageId` is required' });
          if (!properties) return res.status(400).json({ error: '`properties` is required' });
          const result = await svc.updatePage({ pageId, properties });
          return res.status(200).json(result);
        }

        return res.status(400).json({ error: 'Unknown action', allowed: ['createPage', 'updatePage'] });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to handle Notion action', message });
      }
    }

    // GET /integrations/notion-productivity/pages
    async pages(req: any, res: any) {
      try {
        const m = await import('./notion-productivity.service.js');
        const currentUserShim =
          deps?.currentUserService ??
          ({
            getCurrentUserSub: () => (req?.user?.sub || req?.user?.id || null) as string | null,
          } as any);
        const svc = new m.NotionProductivityService(deps?.prisma, currentUserShim);
        const query = typeof req.query?.q === 'string' ? req.query.q : undefined;
        const limit =
          typeof req.query?.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
        const cursor = typeof req.query?.cursor === 'string' ? req.query.cursor : undefined;
        const result = await svc.listPages({ query, limit, cursor });
        return res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to list Notion pages', message });
      }
    }
  })(meta);
}
