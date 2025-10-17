import { Module, OnModuleInit } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { AppStoreRegistry } from './appstore.registry';
import { PrismaService } from '@runfast/prisma';

@Module({
  controllers: [IntegrationsController],
  providers: [AppStoreRegistry, PrismaService],
  exports: [AppStoreRegistry],
})
export class IntegrationsModule implements OnModuleInit {
  constructor(
    private readonly store: AppStoreRegistry,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit() {
    await this.store.init({ prisma: this.prisma });
  }
}
