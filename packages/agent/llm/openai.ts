/// <reference path="./openai.d.ts" />
import OpenAI from 'openai';
import type { LLM, LlmCallMetadata } from './types.js';
import { getLlmContext } from './context.js';
import { logLlmGeneration } from '../observability/langfuse.js';
import { loadLLMConfig } from './config.js';

const getDefaultModel = () => {
  const config = loadLLMConfig();
  return config.openai?.model || config.azure?.deployment || 'gpt-4o';
};

const DEFAULT_MODEL = getDefaultModel();

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

// Create OpenAI client - supports both Azure OpenAI and regular OpenAI
const createOpenAIClient = () => {
  const useAzure = process.env.USE_AZURE_OPENAI === 'true';

  if (useAzure) {
    const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
    const deploymentName =
      process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o';

    if (!azureApiKey || !azureEndpoint) {
      throw new Error(
        'USE_AZURE_OPENAI is true but AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT is missing',
      );
    }

    return new OpenAI({
      apiKey: azureApiKey,
      baseURL: `${azureEndpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': azureApiKey },
    });
  } else {
    // Regular OpenAI
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
};

export function makeOpenAiLLM(client = createOpenAIClient()): LLM {
  return {
    async text({ system, user, temperature = 0.2, maxTokens = 300, timeoutMs = 15_000, metadata }) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);

      const modelOverride = (metadata as any)?.model;
      const chosenModel =
        typeof modelOverride === 'string' && modelOverride.trim().length > 0
          ? modelOverride
          : DEFAULT_MODEL;

      const res = await client.chat.completions.create(
        {
          model: chosenModel,
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

      // Persist to DB when configured
      if (shouldLog(effectiveMetadata)) {
        const userId = parseMaybeNumber(effectiveMetadata.userId)!;
        const teamId = parseMaybeNumber(effectiveMetadata.teamId);
        const promptText = formatPrompt(system, user);
        const usage = res.usage ?? {};
        const model = res.model ?? chosenModel ?? DEFAULT_MODEL;
        const requestType = effectiveMetadata.requestType ?? 'chat_completion';
        const apiEndpoint = effectiveMetadata.apiEndpoint ?? 'chat.completions.create';

        // void prisma.lLMLog
        //   .create({
        //     data: {
        //       userId,
        //       teamId,
        //       prompt: promptText,
        //       result,
        //       promptTokens: usage.prompt_tokens ?? 0,
        //       completionTokens: usage.completion_tokens ?? 0,
        //       totalTokens: usage.total_tokens ?? 0,
        //       requestType,
        //       apiEndpoint,
        //       model,
        //     },
        //   })
        //   .catch((err: unknown) => {
        //     if (process.env.NODE_ENV !== 'production') {
        //       console.error('Failed to persist LLM log', err);
        //     }
        //   });
      }

      // Always attempt to emit to Langfuse when keys are provided (no-op otherwise)
      try {
        const usage = res.usage ?? {};
        const model = res.model ?? chosenModel ?? DEFAULT_MODEL;
        const requestType = effectiveMetadata.requestType ?? 'chat_completion';
        const apiEndpoint = effectiveMetadata.apiEndpoint ?? 'chat.completions.create';
        const userIdForLf = parseMaybeNumber(effectiveMetadata.userId) ?? undefined;
        const teamIdForLf = parseMaybeNumber(effectiveMetadata.teamId) ?? undefined;

        void logLlmGeneration({
          runId: effectiveMetadata.runId,
          userId: userIdForLf,
          teamId: teamIdForLf,
          requestType,
          apiEndpoint,
          model,
          system,
          user,
          completion: result,
          usage,
        }).catch((err) => {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Langfuse log failed', err);
          }
        });
      } catch {
        // ignore Langfuse logging errors
      }

      return result;
    },
  };
}
