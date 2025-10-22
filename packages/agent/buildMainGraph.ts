import { Graph } from './runtime/graph';
import type { RunState } from './state/types';
import type { LLM } from './llm/types';
import { classifyIntent } from './nodes/classifyIntent';
import { planner } from './nodes/planner';
import { confirm } from './nodes/confirm';
import { executor } from './nodes/executor';
import { summarize } from './nodes/summarize';
import { fallback } from './nodes/fallback';
import { routeByMode } from './guards/policy';
import { hooks } from './observability/events';
import { safeNode } from './runtime/safeNode';

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
