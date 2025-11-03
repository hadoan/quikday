import { Module, forwardRef } from '@nestjs/common';
import { RunsService } from './runs.service.js';
import { RunsController } from './runs.controller.js';
import { PrismaModule } from '@quikday/prisma';
import { QueueModule } from '../queue/queue.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { ConfigModule } from '../config/config.module.js';
import { RunTokenService } from './run-token.service.js';
import { CurrentUserModule } from '@quikday/libs';
import { StepsService } from './steps.service.js';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => QueueModule),
    TelemetryModule,
    ConfigModule,
    CurrentUserModule,
  ],
  providers: [RunsService, RunTokenService, StepsService],
  controllers: [RunsController],
  exports: [RunsService, StepsService],
})
export class RunsModule {}
