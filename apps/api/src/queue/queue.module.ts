import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "../config/config.module";
import { ConfigService } from "../config/config.service";
import { RunProcessor } from "./run.processor";

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.env.REDIS_URL },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: "runs" }),
  ],
  providers: [RunProcessor],
  exports: [BullModule],
})
export class QueueModule {}

