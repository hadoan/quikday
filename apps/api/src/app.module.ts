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
import {
  InMemoryEventBus,
  PubSubModule,
  CurrentUserModule,
  CurrentUserInterceptor,
} from '@quikday/libs';
import { EmailModule } from '@quikday/appstore/email/email.module';
import { CalendarModule } from '@quikday/appstore/calendar/calendar.module';
import { GmailEmailService, GmailEmailModule } from '@quikday/appstore-gmail-email';
import { TemplatesModule } from './templates/templates.module';
import { GoogleCalendarModule, GoogleCalendarProviderService } from '@quikday/appstore-google-calendar';

const registry = new Map();
registry.set('gmail', GmailEmailService);

const calendarRegistry = new Map();
calendarRegistry.set('google', GoogleCalendarProviderService);

@Module({
  imports: [
    EmailModule.register({ registry }),
    CalendarModule.register({ registry: calendarRegistry }),
    // Ensure GmailEmailService is a registered provider so tools can resolve it via ModuleRef
    GmailEmailModule,
    // Ensure GoogleCalendarProviderService is available to ModuleRef for agent tools
    GoogleCalendarModule,
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
    TemplatesModule,
    // AgentTestModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: CurrentUserInterceptor }],
})
export class AppModule {}
