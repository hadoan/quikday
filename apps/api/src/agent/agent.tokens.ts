export const AGENT_LLM = Symbol('AGENT_LLM');

export interface AgentModuleOptions {
  llm?: import('@quikday/agent/llm/types').LLM;
}
