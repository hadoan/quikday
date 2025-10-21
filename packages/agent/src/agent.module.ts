import { Module, Global } from '@nestjs/common';

import { AgentService } from './agent.service.js';

@Global()
@Module({
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
