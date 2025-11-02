import { DynamicModule, Module, Provider } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { AGENT_LLM, type AgentModuleOptions } from './agent.tokens.js';
import { makeOpenAiLLM } from '@quikday/agent/llm/openai';
import { PubSubModule } from '@quikday/libs';

@Module({})
export class AgentModule {
  static forRoot(options: AgentModuleOptions = {}): DynamicModule {
    const llmProvider: Provider = options.llm
      ? { provide: AGENT_LLM, useValue: options.llm }
      : { provide: AGENT_LLM, useFactory: () => makeOpenAiLLM() };

    return {
      module: AgentModule,
      imports: [PubSubModule],
      providers: [llmProvider, AgentService],
      exports: [AgentService, AGENT_LLM],
    };
  }

  static register(options: AgentModuleOptions = {}) {
    return this.forRoot(options);
  }
}
