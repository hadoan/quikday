export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface LLM {
  text(args: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<string>;

  // optional, if you do structured outputs elsewhere
  json?<T = Json>(args: {
    system?: string;
    user: string;
    schema?: unknown; // e.g., zod schema you validate after
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<T>;
}
