import { Graph } from './runtime/graph.js';
import type { RunState } from './state/types.js';
import type { LLM } from './llm/types.js';
import { classifyIntent } from './nodes/classifyIntent.js';
import { planner } from './nodes/planner.js';
import { confirm } from './nodes/confirm.js';
import { executor } from './nodes/executor.js';
import { summarize } from './nodes/summarize.js';
import { fallback } from './nodes/fallback.js';
import { routeByMode } from './guards/policy.js';
import { hooks } from './observability/events';
import { safeNode } from './runtime/safeNode.js';

type BuildMainGraphOptions = {
  llm: LLM;
};

export const buildMainGraph = ({ llm }: BuildMainGraphOptions) => {
  void llm; // LLM will be threaded into nodes as LangGraph V2 matures
  return new Graph<RunState>(hooks())
    .addNode('classify', safeNode('classify', classifyIntent))
    .addNode('planner', safeNode('planner', planner))
    .addNode('confirm', safeNode('confirm', confirm))
    .addNode('executor', safeNode('executor', executor))
    .addNode('summarize', safeNode('summarize', summarize))
    .addNode('fallback', fallback('policy_denied'))

    .addEdge('START', () => 'classify')
    .addEdge('classify', routeByMode)
    .addEdge('planner', () => 'confirm')
    .addEdge('confirm', () => 'executor')
    .addEdge('executor', (s) => (s.error ? 'fallback' : 'summarize'))
    .addEdge('summarize', () => 'END')
    .addEdge('fallback', () => 'END');
};
