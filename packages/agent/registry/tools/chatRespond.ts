// packages/agent/registry/tools/chat.respond.ts
import { z } from 'zod';
import type { Tool } from '../types';
import type { LLM } from '../../llm/types';
import { ModuleRef } from '@nestjs/core/injector/module-ref';
import { DEFAULT_ASSISTANT_SYSTEM } from '../../prompts/DEFAULT_ASSISTANT_SYSTEM';

export const ChatRespondIn = z.object({
  prompt: z.string().optional(),
  system: z.string().optional(),
});
export const ChatRespondOut = z.object({ message: z.string() });
export type ChatRespondArgs = z.infer<typeof ChatRespondIn>;
export type ChatRespondResult = z.infer<typeof ChatRespondOut>;

export function chatRespondTool(llm: LLM, moduleRef: ModuleRef): Tool<
  z.infer<typeof ChatRespondIn>,
  z.infer<typeof ChatRespondOut>
> {
  return {
    name: 'chat.respond',
    in: ChatRespondIn,
    out: ChatRespondOut,
    scopes: [],          // no scopes required
    rate: 'unlimited',   // adjust if you want
    risk: 'low',

    async call(args) {
      const text = await llm.text({
        system: args.system ?? DEFAULT_ASSISTANT_SYSTEM,
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
