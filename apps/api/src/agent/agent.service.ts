import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { buildMainGraph } from '@quikday/agent/buildMainGraph';
import type { RunState } from '@quikday/agent/state/types';
import type { Graph } from '@quikday/agent/runtime/graph';
import type { LLM } from '@quikday/agent/llm/types';
import { AGENT_LLM } from './agent.tokens';
import { withLlmContext } from '@quikday/agent/llm/context';
import { RunEventBus } from '@quikday/libs';

@Injectable()
export class AgentService {
  constructor(
    @Inject(AGENT_LLM) private readonly llm: LLM,
    @Inject('RunEventBus') private eventBus: RunEventBus,
    private readonly moduleRef: ModuleRef,
  ) { }

  createGraph(): Graph<RunState, RunEventBus> {
    return buildMainGraph({ llm: this.llm, eventBus: this.eventBus, moduleRef: this.moduleRef });
  }

  async run(initialState: RunState, entryPoint = 'classify'): Promise<RunState> {
    const graph = this.createGraph();
    const { userId, teamId } = initialState.ctx;
    console.log('Running agent graph test', { entryPoint, initialState });
    const finalState = await withLlmContext(
      {
        userId,
        teamId,
        runId: initialState.ctx.runId,
        requestType: 'agent_graph',
        apiEndpoint: entryPoint,
      },
      () => graph.run(entryPoint, initialState, this.eventBus)
    );
    return finalState;

  }
}
