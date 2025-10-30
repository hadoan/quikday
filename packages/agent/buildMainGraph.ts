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
      // First gate on missing inputs immediately after classify. If any required
      // inputs are missing, the confirm node will surface questions and halt.
      .addEdge('classify', () => 'confirm')
      // If confirm set awaiting (questions), end; otherwise continue to plan steps.
      .addEdge('confirm', (s) => (s.scratch?.awaiting ? 'END' : 'planner'))
      // After planning, run confirm again for approvals or to ask any newly
      // discovered questions before execution.
      .addEdge('planner', () => 'confirm')
      // If still awaiting after planning, stop; else proceed to executor.
      .addEdge('confirm', (s) => (s.scratch?.awaiting ? 'END' : 'executor'))
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
