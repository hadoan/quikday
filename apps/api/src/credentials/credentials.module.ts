import { Module } from '@nestjs/common';
import { CredentialService } from './credential.service';
import { CredentialsController } from './credentials.controller';
import { PrismaModule } from '@quikday/prisma';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { ConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, TelemetryModule, ConfigModule, AuthModule],
  controllers: [CredentialsController],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialsModule {}
