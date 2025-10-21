import type { Node } from '../runtime/graph.js';
import type { RunState, PlanStep } from '../state/types.js';
import { events } from '../observability/events';

const makePlanForIntent = (state: RunState): PlanStep[] => {
  const prompt = state.input.prompt;
  const baseArgs = { prompt };

  switch (state.scratch?.intent) {
    case 'calendar.schedule':
      return [
        {
          id: 'step-1',
          tool: 'noop',
          args: { ...baseArgs, action: 'check_calendar' },
          risk: 'low',
        },
        {
          id: 'step-2',
          tool: 'noop',
          args: { ...baseArgs, action: 'create_event' },
          risk: 'low',
        },
      ];
    case 'slack.notify':
      return [
        {
          id: 'step-1',
          tool: 'noop',
          args: { ...baseArgs, action: 'compose_message' },
          risk: 'low',
        },
        {
          id: 'step-2',
          tool: 'noop',
          args: { ...baseArgs, action: 'send_message' },
          risk: 'low',
        },
      ];
    default:
      return [
        {
          id: 'step-1',
          tool: 'noop',
          args: baseArgs,
          risk: 'low',
        },
      ];
  }
};

// Minimal planner stub: in the real app this would call an LLM to create PlanStep[]
export const planner: Node<RunState> = async (s) => {
  const steps = makePlanForIntent(s);
  const diff = {
    summary: `Proposed actions: ${steps.map((step) => step.args?.action ?? step.tool).join(', ')}`,
    steps,
  };

  events.planReady(s, steps, diff);

  return {
    scratch: { ...s.scratch, plan: steps },
    output: { ...s.output, diff },
  };
};
