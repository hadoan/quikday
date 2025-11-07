import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    // Bridge token for libs' CurrentUserService without importing Prisma types there
    { provide: 'CurrentUserPrisma', useExisting: PrismaService },
  ],
  exports: [PrismaService, 'CurrentUserPrisma'],
})
export class PrismaModule {}
