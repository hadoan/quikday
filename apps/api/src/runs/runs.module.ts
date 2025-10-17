import { Module, forwardRef } from '@nestjs/common';
import { RunsService } from './runs.service';
import { RunsController } from './runs.controller';
import { PrismaModule } from '@runfast/prisma';
import { QueueModule } from '../queue/queue.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [PrismaModule, forwardRef(() => QueueModule), TelemetryModule, ConfigModule],
  providers: [RunsService],
  controllers: [RunsController],
  exports: [RunsService],
})
export class RunsModule {}
