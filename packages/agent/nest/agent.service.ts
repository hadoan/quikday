import { Inject, Injectable } from '@nestjs/common';
import { buildMainGraph } from '../buildMainGraph.js';
import type { RunState } from '../state/types.js';
import type { Graph } from '../runtime/graph.js';
import type { LLM } from '../llm/types.js';
import { AGENT_LLM } from './agent.tokens.js';

@Injectable()
export class AgentService {
  constructor(@Inject(AGENT_LLM) private readonly llm: LLM) {}

  createGraph(): Graph<RunState> {
    return buildMainGraph({ llm: this.llm });
  }

  async run(initialState: RunState, entryPoint = 'classify'): Promise<RunState> {
    const graph = this.createGraph();
    return graph.run(entryPoint, initialState);
  }
}
