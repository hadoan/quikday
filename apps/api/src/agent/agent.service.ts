import { Inject, Injectable } from '@nestjs/common';
import { buildMainGraph } from '@quikday/agent/buildMainGraph';
import type { RunState } from '@quikday/agent/state/types';
import type { Graph } from '@quikday/agent/runtime/graph';
import type { LLM } from '@quikday/agent/llm/types';
import { AGENT_LLM } from './agent.tokens';
import { withLlmContext } from '@quikday/agent/llm/context';

@Injectable()
export class AgentService {
  constructor(@Inject(AGENT_LLM) private readonly llm: LLM) {}

  createGraph(): Graph<RunState> {
    return buildMainGraph({ llm: this.llm });
  }

  async run(initialState: RunState, entryPoint = 'classify'): Promise<RunState> {
    const graph = this.createGraph();
    const { userId, teamId } = initialState.ctx;
    return withLlmContext(
      {
        userId,
        teamId,
        runId: initialState.ctx.runId,
        requestType: 'agent_graph',
        apiEndpoint: entryPoint,
      },
      () => graph.run(entryPoint, initialState),
    );
  }
}
