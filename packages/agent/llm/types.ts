export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type LLMProvider = 'openai' | 'azure-openai' | 'anthropic';

export interface LlmCallMetadata {
  userId: number;
  teamId?: number | null;
  // Optional provider override (openai, azure-openai, anthropic)
  provider?: LLMProvider;
  // Optional model override for this call (e.g., 'gpt-4o', 'claude-3-5-haiku-20241022')
  model?: string;
  requestType?: string;
  apiEndpoint?: string;
  runId?: string;
  // Optional user identity hints for prompts/observability
  senderName?: string;
  senderEmail?: string;
}

export interface LLM {
  text(args: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    metadata?: LlmCallMetadata;
  }): Promise<string>;

  // optional, if you do structured outputs elsewhere
  json?<T = Json>(args: {
    system?: string;
    user: string;
    schema?: unknown; // e.g., zod schema you validate after
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    metadata?: LlmCallMetadata;
  }): Promise<T>;
}
