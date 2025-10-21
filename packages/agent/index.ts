import 'dotenv/config';

import { AgentService, type RunAgentCallbacks } from './agent.service.js';

export { AgentModule } from './agent.module.js';
export { AgentService } from './agent.service.js';
export type { RunAgentCallbacks } from './agent.service.js';
export { compileApp } from './graph.js';
export * from './prompts.js';
export { setToolExecutionContext, getToolExecutionContext } from './tools.js';
export type { ToolExecutionContext } from './tools.js';

const defaultAgentService = new AgentService();

export function runAgent(prompt: string): Promise<string[]> {
  return defaultAgentService.runAgent(prompt);
}

export function runAgentWithEvents(
  prompt: string,
  callbacks?: RunAgentCallbacks,
): Promise<{ messages: any[]; finalOutput: string | null }> {
  return defaultAgentService.runAgentWithEvents(prompt, callbacks);
}
