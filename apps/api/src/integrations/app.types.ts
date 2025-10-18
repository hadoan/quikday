import { PrismaService as QuikdayPrismaService } from '@quikday/prisma';

export interface AppDeps {
  prisma: QuikdayPrismaService;
  /* add logger, config, httpClient as needed */
}
