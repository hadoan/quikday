import type { Prisma } from '@prisma/client';

export async function getAppKeysFromSlug(prisma: any, slug: string) {
  const app = await prisma.app.findUnique({ where: { slug } });
  return (app?.keys || {}) as Prisma.JsonObject;
}
