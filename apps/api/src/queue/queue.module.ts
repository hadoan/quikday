import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';
import { RunProcessor } from './run.processor.js';
import { StepRunProcessor } from './step-run.processor.js';
import { RunsModule } from '../runs/runs.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { RedisModule, PubSubModule, CurrentUserModule } from '@quikday/libs';
import { AgentModule } from '../agent/index.js';

@Module({
  imports: [
    // avoid circular import by using forwardRef in RunsModule and here import RunsModule
    forwardRef(() => RunsModule),
    ConfigModule,
    CredentialsModule,
    // RedisModule,
    PubSubModule,
    CurrentUserModule,
    AgentModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.env.REDIS_URL;
        const needsTls = url.startsWith('rediss://');
        let servername: string | undefined;
        try {
          servername = new URL(url).hostname;
        } catch (err) {
          console.warn('[QueueModule] Failed to parse REDIS_URL for TLS SNI:', err);
        }
        return {
          connection: {
            url,
            // serverless-friendly options
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            lazyConnect: true,
            tls: needsTls
              ? {
                  servername,
                  rejectUnauthorized:
                    (process.env.REDIS_TLS_REJECT_UNAUTHORIZED ?? 'false').toLowerCase() === 'true',
                }
              : undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'runs' }),
    BullModule.registerQueue({ name: 'steps' }),
    TelemetryModule,
  ],
  providers: [RunProcessor, StepRunProcessor],
  exports: [BullModule],
})
export class QueueModule {}
