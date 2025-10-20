import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from '@quikday/prisma';
import { AuthModule } from './auth/auth.module';
import { RunsModule } from './runs/runs.module';
import { ChatModule } from './chat/chat.module';
import { QueueModule } from './queue/queue.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { TeamsModule } from './teams/teams.module';
import { CredentialsModule } from './credentials/credentials.module';
import { WebSocketModule } from './websocket/websocket.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    RunsModule,
    ChatModule,
    QueueModule,
    TelemetryModule,
    TeamsModule,
    CredentialsModule,
    WebSocketModule,
    IntegrationsModule,
    UsersModule,
  ],
})
export class AppModule {}
