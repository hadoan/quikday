// packages/agent/registry/tools/chat.respond.ts
import { z } from 'zod';
import type { Tool } from '../types.js';
import type { LLM } from '../../llm/types.js';
import { ModuleRef } from '@nestjs/core';
import { DEFAULT_ASSISTANT_SYSTEM } from '../../prompts/DEFAULT_ASSISTANT_SYSTEM.js';

export const ChatRespondIn = z.object({
  prompt: z.string().optional(),
  system: z.string().optional(),
  // Optional advanced controls; safe defaults if omitted
  timeoutMs: z.number().optional(),
  maxTokens: z.number().optional(),
});
export const ChatRespondOut = z.object({ message: z.string() });
export type ChatRespondArgs = z.infer<typeof ChatRespondIn>;
export type ChatRespondResult = z.infer<typeof ChatRespondOut>;

export function chatRespondTool(
  llm: LLM,
  moduleRef: ModuleRef,
): Tool<z.infer<typeof ChatRespondIn>, z.infer<typeof ChatRespondOut>> {
  return {
    name: 'chat.respond',
    description:
      'Generate a conversational response using the LLM. Optional: prompt (user message), system (system prompt override).',
    in: ChatRespondIn,
    out: ChatRespondOut,
    apps: [], // no external app integration - internal LLM tool
    scopes: [], // no scopes required
    rate: 'unlimited', // adjust if you want
    risk: 'low',

    async call(args) {
      const envTimeout = Number.parseInt(process.env.CHAT_RESPOND_TIMEOUT_MS || '', 10);
      const envMaxTokens = Number.parseInt(process.env.CHAT_RESPOND_MAX_TOKENS || '', 10);
      const timeoutMs =
        Number.isFinite(args.timeoutMs) && (args.timeoutMs as number) > 0
          ? (args.timeoutMs as number)
          : Number.isFinite(envTimeout) && envTimeout > 0
            ? envTimeout
            : 45_000; // sensible default to avoid premature aborts
      const maxTokens =
        Number.isFinite(args.maxTokens) && (args.maxTokens as number) > 0
          ? (args.maxTokens as number)
          : Number.isFinite(envMaxTokens) && envMaxTokens > 0
            ? envMaxTokens
            : 1000;

      const text = await llm.text({
        system: args.system ?? DEFAULT_ASSISTANT_SYSTEM,
        user: args.prompt ?? '',
        temperature: 0.3,
        maxTokens,
        timeoutMs,
      });
      const msg = (text ?? '').trim();
      return { message: msg.length ? msg : 'Okay.' };
    },
  };
}
