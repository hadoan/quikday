import { Graph } from './runtime/graph';
import type { RunState } from './state/types';
import type { LLM } from './llm/types';
import { makeClassifyIntent } from './nodes/classifyIntent';
import { makePlanner } from './nodes/planner';
import { confirm } from './nodes/confirm';
import { executor } from './nodes/executor';
import { summarize } from './nodes/summarize';
import { fallback } from './nodes/fallback';
import { routeByMode } from './guards/policy';
import { hooks } from './observability/events';
import { safeNode } from './runtime/safeNode';
import { RunEventBus } from '@quikday/libs';
import { Run } from 'openai/resources/beta/threads/runs/runs';
import { registerToolsWithLLM } from './registry/registry';
import { ModuleRef } from '@nestjs/core';

type BuildMainGraphOptions = {
  llm: LLM;
  eventBus: RunEventBus;
  moduleRef: ModuleRef;
};

export const buildMainGraph = ({ llm, eventBus, moduleRef }: BuildMainGraphOptions) => {
  registerToolsWithLLM(llm, moduleRef);
  return (
    new Graph<RunState, RunEventBus>(hooks(eventBus))
      .addNode('classify', makeClassifyIntent(llm))
      .addNode('planner', safeNode('planner', makePlanner(llm), eventBus))
      .addNode('confirm', safeNode('confirm', confirm, eventBus))
      .addNode('executor', safeNode('executor', executor, eventBus))
      .addNode('summarize', summarize(llm))
      .addNode('fallback', fallback('unspecified'))

      // .addEdge('START', () => 'classify')
      // .addEdge('classify', routeByMode)
      // .addEdge('planner', () => 'confirm')
      // .addEdge('confirm', () => 'executor')
      // .addEdge('executor', (s) => (s.error ? 'fallback' : 'summarize'))
      // .addEdge('summarize', () => 'END')
      // .addEdge('fallback', () => 'END');

      .addEdge('START', () => 'classify')
      // First gate on missing inputs immediately after classify
      .addEdge('classify', (s) => {
        // If missing inputs, go to confirm which will ask questions
        if (s.scratch?.awaiting) return 'confirm';
        // Otherwise go straight to planner
        return 'planner';
      })
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
        
        // AUTO mode: Continue to execution immediately (no approval needed)
        if (s.mode === 'AUTO') {
          return 'confirm'; // Proceed to execution flow
        }
        
        // Default: go to confirm
        return 'confirm';
      })
      // After confirm, check if awaiting or ready to execute
      .addEdge('confirm', (s) => {
        if (s.scratch?.awaiting) return 'END';
        // If we have a plan, execute it
        const hasPlan = (s.scratch?.plan ?? []).length > 0;
        return hasPlan ? 'executor' : 'END';
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
