import { Module, forwardRef } from '@nestjs/common';
import { RunsService } from './runs.service';
import { RunsController } from './runs.controller';
import { PrismaModule } from '@quikday/prisma';
import { QueueModule } from '../queue/queue.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { ConfigModule } from '../config/config.module';
import { RunTokenService } from './run-token.service';
import { CurrentUserModule } from '@quikday/libs';
import { StepsService } from './steps.service';

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
