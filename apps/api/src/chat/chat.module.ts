import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { RunsModule } from "../runs/runs.module";
import { AuthModule } from "../auth/auth.module";

@Module({ imports: [RunsModule, AuthModule], controllers: [ChatController], providers: [ChatService] })
export class ChatModule {}

