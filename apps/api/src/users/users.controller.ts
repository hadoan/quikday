import { Controller, Post, Req, Res, UseGuards, Body } from '@nestjs/common';
import type { Response, Request } from 'express';
import { KindeGuard } from '../auth/kinde.guard.js';
import { AuthService } from '../auth/auth.service.js';

type SyncUserBody = {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

@Controller('users')
export class UsersController {
  constructor(private authService: AuthService) {}

  @Post('sync')
  @UseGuards(KindeGuard)
  async sync(@Req() req: Request, @Res() res: Response, @Body() body: SyncUserBody) {
    const claims: any = (req as any).user || {};
    const sub = claims?.sub as string | undefined;
    if (!sub) return res.status(400).json({ message: 'Missing sub in token' });

    try {
      // Use AuthService to provision both user and workspace
      // Prefer body data (from frontend user profile) over token claims
      const result = await this.authService.getOrProvisionUserAndWorkspace({
        sub,
        email: body.email || claims?.email,
        name: body.name || claims?.name,
        given_name: body.given_name || claims?.given_name,
        family_name: body.family_name || claims?.family_name,
      });

      return res.json(result);
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'User sync error';
      return res.status(400).json({ message });
    }
  }
}
