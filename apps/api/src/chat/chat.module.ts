import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AgentModule } from '@quikday/agent';
import { RunsModule } from '../runs/runs.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [RunsModule, AuthModule, ConfigModule, AgentModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
