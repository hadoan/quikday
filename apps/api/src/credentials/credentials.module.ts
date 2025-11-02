import { Module } from '@nestjs/common';
import { CredentialService } from './credential.service.js';
import { CredentialsController } from './credentials.controller.js';
import { PrismaModule } from '@quikday/prisma';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { ConfigModule } from '../config/config.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, TelemetryModule, ConfigModule, AuthModule],
  controllers: [CredentialsController],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialsModule {}
