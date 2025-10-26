import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from '@quikday/prisma';
import { AuthModule } from './auth/auth.module';
import { RunsModule } from './runs/runs.module';
import { QueueModule } from './queue/queue.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { TeamsModule } from './teams/teams.module';
import { CredentialsModule } from './credentials/credentials.module';
import { WebSocketModule } from './websocket/websocket.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { UsersModule } from './users/users.module';
// import { AgentTestModule } from './agent-test/agent-test.module';
import { AgentModule } from './agent';
import { InMemoryEventBus, PubSubModule, CurrentUserModule, CurrentUserInterceptor } from '@quikday/libs';
import { EmailModule } from '@quikday/appstore/email/email.module';
import { GmailEmailService } from '@quikday/appstore-gmail-email';


const registry = new Map();
registry.set('gmail', GmailEmailService);

@Module({
  imports: [
    EmailModule.register({ registry }),
    PubSubModule,
    CurrentUserModule,
    ConfigModule,
    PrismaModule,
    AuthModule,
    RunsModule,
    QueueModule,
    TelemetryModule,
    TeamsModule,
    CredentialsModule,
  WebSocketModule,
  IntegrationsModule,
  UsersModule,
  AgentModule,
    // AgentTestModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CurrentUserInterceptor },
  ],
})
export class AppModule { }
