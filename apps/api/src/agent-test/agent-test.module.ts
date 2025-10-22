import { Module } from '@nestjs/common';
import { AgentModule } from '@quikday/agent/nest';
import { AgentTestController } from './agent-test.controller';

@Module({
  imports: [AgentModule.forRoot()],
  controllers: [AgentTestController],
})
export class AgentTestModule {}
