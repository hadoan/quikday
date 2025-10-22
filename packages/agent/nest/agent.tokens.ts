export const AGENT_LLM = Symbol('AGENT_LLM');

export interface AgentModuleOptions {
  llm?: import('../llm/types').LLM;
}
