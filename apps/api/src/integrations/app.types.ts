import { PrismaService as RunfastPrismaService } from '@runfast/prisma';

export interface AppDeps {
  prisma: RunfastPrismaService;
  /* add logger, config, httpClient as needed */
}
