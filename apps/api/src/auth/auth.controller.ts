import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { KindeGuard } from './kinde.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Get('me')
  @UseGuards(KindeGuard)
  async me(@Req() req: Request, @Res() res: Response) {
    const claims: any = (req as any).user || {};
    try {
      const me = await this.auth.getOrProvisionUserAndWorkspace({
        sub: claims?.sub,
        email: claims?.email,
        name: claims?.name,
        given_name: claims?.given_name,
        family_name: claims?.family_name,
      });
      return res.json(me);
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'Auth error';
      return res.status(400).json({ message });
    }
  }
}
