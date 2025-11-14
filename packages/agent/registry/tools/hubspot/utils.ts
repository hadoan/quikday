import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import type { RunCtx } from '../../../state/types.js';

export async function resolveHubspotService(moduleRef: ModuleRef): Promise<any> {
  const pkg = '@quikday/appstore-hubspot-crm' as string;
  const m: any = await import(pkg);
  const HubspotCrmService = (m as any).HubspotCrmService;
  return moduleRef.get(HubspotCrmService as any, { strict: false });
}

export async function resolveNumericUserId(moduleRef: ModuleRef, ctx: RunCtx): Promise<number> {
  const prisma = moduleRef.get(PrismaService, { strict: false });
  if (!prisma) throw new Error('PrismaService unavailable');
  const identifier = ctx.userId;
  const where =
    typeof identifier === 'number'
      ? { id: identifier }
      : { sub: String(identifier) };
  const user = await prisma.user.findUnique({ where });
  if (!user) throw new Error('User not found');
  return user.id;
}
