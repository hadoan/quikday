import { Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response, Request } from 'express';
import { KindeGuard } from '../auth/kinde.guard.js';
import { Public } from '../auth/public.decorator.js';
import { AppStoreRegistry } from './appstore.registry.js';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly store: AppStoreRegistry) {}

  @Get()
  list(@Res() res: Response) {
    const items = this.store.list();
    return res.json(items);
  }

  @Get(':slug/add')
  @UseGuards(KindeGuard)
  async add(@Param('slug') slug: string, @Req() req: Request, @Res() res: Response) {
    const app = this.store.get(slug);
    if (!app) return res.status(404).json({ message: 'Unknown integration slug' });
    // Delegates to app
    return app.add(req, res);
  }

  /**
   * OAuth callback endpoint - PUBLIC (no auth required)
   *
   * This endpoint receives redirects from OAuth providers (Google, LinkedIn, etc.)
   * after user authorization. It MUST be public because:
   * 1. Browser redirects cannot include Bearer tokens
   * 2. Security is provided by:
   *    - Signed/encrypted state parameter (CSRF protection)
   *    - Single-use authorization codes
   *    - Registered redirect_uri validation by OAuth provider
   *
   * User context is recovered from the validated state parameter.
   */
  @Get(':slug/callback')
  @Public()
  async callback(@Param('slug') slug: string, @Req() req: Request, @Res() res: Response) {
    const app = this.store.get(slug);
    if (!app) return res.status(404).json({ message: 'Unknown integration slug' });
    return app.callback(req, res);
  }

  @Post(':slug/post')
  @UseGuards(KindeGuard)
  async post(@Param('slug') slug: string, @Req() req: Request, @Res() res: Response) {
    const app = this.store.get(slug);
    if (!app) return res.status(404).json({ message: 'Unknown integration slug' });
    return app.post(req, res);
  }
}
