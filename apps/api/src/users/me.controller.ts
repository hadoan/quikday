import { Body, Controller, Get, Patch, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '@quikday/prisma';
import { KindeGuard } from '../auth/kinde.guard.js';

@Controller('users')
export class UsersMeController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  @UseGuards(KindeGuard)
  async getMe(@Req() req: Request, @Res() res: Response) {
    const claims: any = (req as any).user || {};
    const sub = (claims?.sub as string | undefined) || undefined;
    const email = (claims?.email as string | undefined)?.trim()?.toLowerCase();

    if (!sub && !email) return res.status(401).json({ message: 'Missing sub or email in token' });

    let user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    if (!user && sub) user = await this.prisma.user.findUnique({ where: { sub } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({
      id: user.id,
      email: user.email || undefined,
      name: user.displayName || undefined,
      avatar: user.avatar || undefined,
      timeZone: user.timeZone || undefined,
      plan: user.plan,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt || undefined,
    });
  }

  @Patch('me')
  @UseGuards(KindeGuard)
  async updateMe(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { name?: string; avatar?: string }
  ) {
    const claims: any = (req as any).user || {};
    const sub = (claims?.sub as string | undefined) || undefined;
    const email = (claims?.email as string | undefined)?.trim()?.toLowerCase();

    if (!sub && !email) return res.status(401).json({ message: 'Missing sub or email in token' });

    let user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    if (!user && sub) user = await this.prisma.user.findUnique({ where: { sub } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const data: { displayName?: string | null; avatar?: string | null } = {};
    if (body.name !== undefined) data.displayName = body.name || null;
    if (body.avatar !== undefined) data.avatar = body.avatar || null;

    const updated = await this.prisma.user.update({ where: { id: user.id }, data });
    return res.json({
      id: updated.id,
      email: updated.email,
      name: updated.displayName || undefined,
      avatar: updated.avatar || undefined,
      plan: updated.plan,
      createdAt: updated.createdAt,
      lastLoginAt: updated.lastLoginAt || undefined,
    });
  }
}
