import { PrismaService } from '../common/prisma.service';

export interface AppDeps {
  prisma: PrismaService;
  /* add logger, config, httpClient as needed */
}

