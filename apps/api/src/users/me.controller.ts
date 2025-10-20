import { Body, Controller, Patch, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '@quikday/prisma';
import { KindeGuard } from '../auth/kinde.guard';

@Controller('users')
export class UsersMeController {
  constructor(private prisma: PrismaService) {}

  @Patch('me')
  @UseGuards(KindeGuard)
  async updateMe(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { name?: string; avatar?: string }
  ) {
    const claims: any = (req as any).user || {};
    const sub = claims?.sub as string | undefined;
    if (!sub) return res.status(401).json({ message: 'Missing sub in token' });

    const user = await this.prisma.user.findUnique({ where: { sub } });
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
