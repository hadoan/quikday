/// <reference path="./openai.d.ts" />
import OpenAI from 'openai';
import type { LLM } from './types';

export function makeOpenAiLLM(client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })): LLM {
  return {
    async text({ system, user, temperature = 0.2, maxTokens = 300, timeoutMs = 15_000 }) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);

      const res = await client.chat.completions.create(
        {
          model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
          messages: [
            ...(system ? [{ role: 'system', content: system as string }] : []),
            { role: 'user', content: user },
          ],
          temperature,
          max_tokens: maxTokens,
        },
        { signal: ctrl.signal as any },
      );

      clearTimeout(t);
      return res.choices?.[0]?.message?.content?.toString() ?? '';
    },
  };
}
