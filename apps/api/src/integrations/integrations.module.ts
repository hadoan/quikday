import { Module, OnModuleInit } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { AppStoreRegistry } from './appstore.registry.js';
import { PrismaService } from '@quikday/prisma';
import { AuthModule } from '../auth/auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { createSignedState, validateSignedState } from '../auth/oauth-state.util.js';

@Module({
  imports: [AuthModule, ConfigModule],
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
    await this.store.init({
      prisma: this.prisma,
      createSignedState,
      validateSignedState,
    });
  }
}
