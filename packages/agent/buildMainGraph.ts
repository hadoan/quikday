import { Graph } from './runtime/graph.js';
import type { RunState } from './state/types.js';
import type { LLM } from './llm/types.js';
import { makeExtractGoal } from './nodes/extractGoal.js';
import { makePlanner } from './nodes/planner.js';
import { confirm } from './nodes/confirm.js';
import { executor } from './nodes/executor.js';
import { summarize } from './nodes/summarize.js';
import { fallback } from './nodes/fallback.js';
import { routeByMode } from './guards/policy.js';
import { hooks } from './observability/events.js';
import { safeNode } from './runtime/safeNode.js';
import { RunEventBus } from '@quikday/libs';
import { Run } from 'openai/resources/beta/threads/runs/runs';
import { registerToolsWithLLM } from './registry/registry.js';
import { ModuleRef } from '@nestjs/core';
import { ensureInputs } from './nodes/ensureInputs.js';

type BuildMainGraphOptions = {
  llm: LLM;
  eventBus: RunEventBus;
  moduleRef: ModuleRef;
};

export const buildMainGraph = ({ llm, eventBus, moduleRef }: BuildMainGraphOptions) => {
  registerToolsWithLLM(llm, moduleRef);
  return (
    new Graph<RunState, RunEventBus>(hooks(eventBus))
      .addNode('extractGoal', makeExtractGoal(llm))
      .addNode('planner', safeNode('planner', makePlanner(llm), eventBus))
      .addNode('ensure_inputs', safeNode('ensure_inputs', ensureInputs, eventBus))
      .addNode('confirm', safeNode('confirm', confirm, eventBus))
      .addNode('executor', safeNode('executor', executor, eventBus))
      .addNode('summarize', summarize(llm))
      .addNode('fallback', fallback('unspecified'))

      // Goal-oriented flow: extract goal → plan → execute
      .addEdge('START', () => 'extractGoal')
      // After extracting goal, go directly to planner
      .addEdge('extractGoal', () => 'planner')
      // After planning: check for missing inputs, then mode to determine flow
      .addEdge('planner', (s) => {
        const plan = s.scratch?.plan ?? [];
        const goal = s.scratch?.goal;
        const missing = (goal?.missing ?? []) as Array<{ key: string; required?: boolean }>;
        const requiredMissing = missing.filter((m) => m.required !== false);
        
        // First priority: Check if we have missing required inputs
        if (requiredMissing.length > 0) {
          // We have missing inputs - go to ensure_inputs to handle them
          return 'ensure_inputs';
        }
        
        const onlyChatRespond = plan.length > 0 && 
          plan.every((st) => st.tool === 'chat.respond');
        const hasExecutableSteps = plan.length > 0 && !onlyChatRespond;
        
        // If only chat.respond, always execute immediately regardless of mode
        if (onlyChatRespond) {
          return 'confirm'; // Execute chat response immediately
        }
        
        // PREVIEW mode: Just show the plan, don't execute
        if (s.mode === 'PREVIEW') {
          return 'END'; // Show plan only, no execution
        }
        
        // APPROVAL mode: Show plan and halt for user approval
        if (s.mode === 'APPROVAL' && hasExecutableSteps) {
          // Mark as awaiting approval - will be handled by processor
          (s.scratch as any).requiresApproval = true;
          return 'END'; // Halt graph here, wait for approval
        }
        
        // For AUTO/default: proceed to confirm
        return 'confirm';
      })
      // If inputs missing, pause; otherwise proceed to planner for re-planning
      .addEdge('ensure_inputs', (s) => (s.scratch?.awaiting ? 'END' : 'planner'))
      // After confirm, execute the plan
      .addEdge('confirm', (s) => {
        // If confirm created questions, pause until /runs/:id/confirm answers arrive
        if (s.scratch?.awaiting) return 'END';
        // Otherwise execute the plan
        return 'executor';
      })
      .addEdge('executor', (s) => {
        if (s.error) return 'fallback';
        const plan = s.scratch?.plan ?? [];
        const onlyChat = plan.length > 0 && plan.every((st) => st.tool === 'chat.respond');
        return onlyChat ? 'END' : 'summarize';
      })
      .addEdge('summarize', () => 'END')
      .addEdge('fallback', () => 'END')
  );
};
