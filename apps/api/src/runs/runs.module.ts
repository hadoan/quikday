import { Module, forwardRef } from '@nestjs/common';
import { RunsService } from './runs.service';
import { RunsController } from './runs.controller';
import { PrismaModule } from '@quikday/prisma';
import { QueueModule } from '../queue/queue.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { ConfigModule } from '../config/config.module';
import { RunTokenService } from './run-token.service';
import { CurrentUserModule } from '@quikday/libs';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => QueueModule),
    TelemetryModule,
    ConfigModule,
    CurrentUserModule,
  ],
  providers: [RunsService, RunTokenService],
  controllers: [RunsController],
  exports: [RunsService],
})
export class RunsModule {}
