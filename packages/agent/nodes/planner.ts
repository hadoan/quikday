import type { Node } from '../runtime/graph.js';
import type { RunState, PlanStep } from '../state/types.js';

// Minimal planner stub: in the real app this calls the LLM to create PlanStep[]
export const planner: Node<RunState> = async (s) => {
  const steps: PlanStep[] = [{ id: '1', tool: 'noop', args: {}, risk: 'low' }];
  const diff = { summary: '(stubbed)' };
  return { scratch: { ...s.scratch, plan: steps }, output: { ...s.output, diff } };
};
