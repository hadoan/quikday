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

      // Goal-oriented flow: extract goal → confirm → plan → execute
      .addEdge('START', () => 'extractGoal')
      // After extracting goal, check if we need more information
      .addEdge('extractGoal', () => 'confirm')
      // After planning: check mode to determine flow
      .addEdge('planner', (s) => {
        const plan = s.scratch?.plan ?? [];
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
        // For AUTO/default: check inputs one more time before confirm
        return 'ensure_inputs';
      })
      // If inputs missing, pause; otherwise proceed to confirm
      .addEdge('ensure_inputs', (s) => (s.scratch?.awaiting ? 'END' : 'confirm'))
      // After confirm, either pause (awaiting), proceed to planner (no plan yet), or execute (plan ready)
      .addEdge('confirm', (s) => {
        // If confirm created questions, pause until /runs/:id/confirm answers arrive
        if (s.scratch?.awaiting) return 'END';
        // No questions — if no plan yet, head to planner; otherwise execute the plan
        const hasPlan = (s.scratch?.plan ?? []).length > 0;
        return hasPlan ? 'executor' : 'planner';
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
