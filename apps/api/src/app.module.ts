import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { PrismaModule } from "@runfast/prisma";
import { AuthModule } from "./auth/auth.module";
import { RunsModule } from "./runs/runs.module";
import { ChatModule } from "./chat/chat.module";
import { QueueModule } from "./queue/queue.module";
import { TelemetryModule } from "./telemetry/telemetry.module";
import { TeamsModule } from "./teams/teams.module";

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, RunsModule, ChatModule, QueueModule, TelemetryModule, TeamsModule],
})
export class AppModule {}
