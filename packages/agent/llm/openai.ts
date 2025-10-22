/// <reference path="./openai.d.ts" />
import OpenAI from 'openai';
import { prisma } from '@quikday/prisma';
import type { LLM, LlmCallMetadata } from './types';
import { getLlmContext } from './context';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const formatPrompt = (system?: string, user?: string) => {
  if (system && user) return `System:\n${system}\n\nUser:\n${user}`;
  if (system) return `System:\n${system}`;
  return user ?? '';
};

const parseMaybeNumber = (value?: string | number | null) => {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const shouldLog = (metadata?: Partial<LlmCallMetadata>) =>
  Boolean(process.env.DATABASE_URL && metadata && parseMaybeNumber(metadata.userId) !== null);

export function makeOpenAiLLM(client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })): LLM {
  return {
    async text({
      system,
      user,
      temperature = 0.2,
      maxTokens = 300,
      timeoutMs = 15_000,
      metadata,
    }) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);

      const res = await client.chat.completions.create(
        {
          model: DEFAULT_MODEL,
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

      const result = res.choices?.[0]?.message?.content?.toString() ?? '';
      const contextMetadata = getLlmContext();
      const effectiveMetadata = { ...(contextMetadata ?? {}), ...(metadata ?? {}) };

      if (shouldLog(effectiveMetadata)) {
        const userId = parseMaybeNumber(effectiveMetadata.userId)!;
        const teamId = parseMaybeNumber(effectiveMetadata.teamId);
        const promptText = formatPrompt(system, user);
        const usage = res.usage ?? {};
        const model = res.model ?? DEFAULT_MODEL;
        const requestType = effectiveMetadata.requestType ?? 'chat_completion';
        const apiEndpoint = effectiveMetadata.apiEndpoint ?? 'chat.completions.create';

        void prisma.lLMLog
          .create({
            data: {
              userId,
              teamId,
              prompt: promptText,
              result,
              promptTokens: usage.prompt_tokens ?? 0,
              completionTokens: usage.completion_tokens ?? 0,
              totalTokens: usage.total_tokens ?? 0,
              requestType,
              apiEndpoint,
              model,
            },
          })
          .catch((err: unknown) => {
            if (process.env.NODE_ENV !== 'production') {
              console.error('Failed to persist LLM log', err);
            }
          });
      }

      return result;
    },
  };
}
