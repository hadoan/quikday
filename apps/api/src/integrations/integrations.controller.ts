import { Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { KindeGuard } from '../auth/kinde.guard';
import { AppStoreRegistry } from './appstore.registry';

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

  @Get(':slug/callback')
  @UseGuards(KindeGuard)
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
