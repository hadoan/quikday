export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface LlmCallMetadata {
  userId: number;
  teamId?: number | null;
  // Optional model override for this call (e.g., 'gpt-4o')
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
