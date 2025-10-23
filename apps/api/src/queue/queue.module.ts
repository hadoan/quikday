import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';
import { RunProcessor } from './run.processor';
import { RunsModule } from '../runs/runs.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { RedisModule, PubSubModule } from '@quikday/libs';
import { AgentModule } from '../agent';

@Module({
  imports: [
    // avoid circular import by using forwardRef in RunsModule and here import RunsModule
    forwardRef(() => RunsModule),
    ConfigModule,
    CredentialsModule,
    RedisModule,
    PubSubModule,
    AgentModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.env.REDIS_URL },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'runs' }),
    TelemetryModule,
  ],
  providers: [RunProcessor],
  exports: [BullModule],
})
export class QueueModule {}
