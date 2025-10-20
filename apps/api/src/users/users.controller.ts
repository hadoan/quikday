import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { PrismaService } from '@quikday/prisma';
import { KindeGuard } from '../auth/kinde.guard';

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Post('sync')
  @UseGuards(KindeGuard)
  async sync(@Req() req: Request, @Res() res: Response) {
    const claims: any = (req as any).user || {};
    const sub = claims?.sub as string | undefined;
    if (!sub) return res.status(400).json({ message: 'Missing sub in token' });

    const email: string | undefined = claims?.email;
    const displayName: string | undefined =
      claims?.name || [claims?.given_name, claims?.family_name].filter(Boolean).join(' ');

    const user = await this.prisma.user.upsert({
      where: { sub },
      update: { email, displayName },
      create: { sub, email, displayName },
    });

    return res.json({ id: user.id, sub: user.sub, email: user.email, displayName: user.displayName });
  }
}

