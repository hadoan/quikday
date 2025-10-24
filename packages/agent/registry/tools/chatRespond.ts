// packages/agent/registry/tools/chat.respond.ts
import { z } from 'zod';
import type { Tool } from '../types';
import type { LLM } from '../../llm/types';

export function chatRespondTool(llm: LLM): Tool<
  { prompt?: string; system?: string },
  { message: string }
> {
  return {
    name: 'chat.respond',
    in: z.object({
      prompt: z.string().optional(),
      system: z.string().optional(),
    }),
    out: z.object({
      message: z.string(),
    }),
    scopes: [],          // no scopes required
    rate: 'unlimited',   // adjust if you want
    risk: 'low',

    async call(args) {
      const text = await llm.text({
        system:
          args.system ??
          'You are a helpful assistant. If no tool fits, answer normally. Keep it concise unless asked for details.',
        user: args.prompt ?? '',
        temperature: 0.3,
        maxTokens: 500,
        timeoutMs: 15_000,
      });
      const msg = (text ?? '').trim();
      return { message: msg.length ? msg : 'Okay.' };
    },
  };
}
