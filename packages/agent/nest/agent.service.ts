import { Inject, Injectable } from '@nestjs/common';
import { buildMainGraph } from '../buildMainGraph';
import type { RunState } from '../state/types';
import type { Graph } from '../runtime/graph';
import type { LLM } from '../llm/types';
import { AGENT_LLM } from './agent.tokens';
import { withLlmContext } from '../llm/context';

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
