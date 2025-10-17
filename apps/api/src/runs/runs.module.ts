import { Module } from "@nestjs/common";
import { RunsService } from "./runs.service";
import { RunsController } from "./runs.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { TelemetryModule } from "../telemetry/telemetry.module";

@Module({
  imports: [PrismaModule, QueueModule, TelemetryModule],
  providers: [RunsService],
  controllers: [RunsController],
  exports: [RunsService],
})
export class RunsModule {}

