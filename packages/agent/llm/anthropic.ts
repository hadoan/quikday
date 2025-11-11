import Anthropic from '@anthropic-ai/sdk';
import type { LLM, LlmCallMetadata } from './types.js';
import { getLlmContext } from './context.js';
import { logLlmGeneration } from '../observability/langfuse.js';
import { loadLLMConfig } from './config.js';

const getDefaultModel = () => {
  const config = loadLLMConfig();
  return config.anthropic?.model || 'claude-3-5-haiku-20241022';
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

/**
 * Create Anthropic (Claude) client
 */
const createAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for Claude');
  }

  return new Anthropic({
    apiKey,
  });
};

/**
 * Creates a Claude LLM instance using Anthropic's API.
 * Supports Claude 3.5 Haiku and other Anthropic models.
 *
 * @param client - Optional Anthropic client instance (useful for testing)
 * @returns LLM instance compatible with the Quik.day agent system
 */
export function makeAnthropicLLM(client = createAnthropicClient()): LLM {
  return {
    async text({ system, user, temperature = 0.2, maxTokens = 300, timeoutMs = 15_000, metadata }) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);

      const modelOverride = (metadata as any)?.model;
      const chosenModel =
        typeof modelOverride === 'string' && modelOverride.trim().length > 0
          ? modelOverride
          : DEFAULT_MODEL;

      try {
        const messages: Anthropic.MessageParam[] = [
          {
            role: 'user',
            content: user,
          },
        ];

        const res = await client.messages.create(
          {
            model: chosenModel,
            messages,
            system: system || undefined,
            temperature,
            max_tokens: maxTokens,
          },
          {
            signal: ctrl.signal,
          },
        );

        clearTimeout(t);

        // Extract text from the response
        const result =
          res.content
            .filter((block) => block.type === 'text')
            .map((block) => (block as Anthropic.TextBlock).text)
            .join('\n') || '';

        const contextMetadata = getLlmContext();
        const effectiveMetadata = { ...(contextMetadata ?? {}), ...(metadata ?? {}) };

        // Persist to DB when configured
        if (shouldLog(effectiveMetadata)) {
          const userId = parseMaybeNumber(effectiveMetadata.userId)!;
          const teamId = parseMaybeNumber(effectiveMetadata.teamId);
          const promptText = formatPrompt(system, user);
          const usage = res.usage;
          const model = res.model ?? chosenModel ?? DEFAULT_MODEL;
          const requestType = effectiveMetadata.requestType ?? 'chat_completion';
          const apiEndpoint = effectiveMetadata.apiEndpoint ?? 'messages.create';

          // Database logging (commented out - enable when ready)
          // void prisma.lLMLog
          //   .create({
          //     data: {
          //       userId,
          //       teamId,
          //       prompt: promptText,
          //       result,
          //       promptTokens: usage.input_tokens ?? 0,
          //       completionTokens: usage.output_tokens ?? 0,
          //       totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
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

        // Always attempt to emit to Langfuse when keys are provided
        try {
          const usage = res.usage;
          const model = res.model ?? chosenModel ?? DEFAULT_MODEL;
          const requestType = effectiveMetadata.requestType ?? 'chat_completion';
          const apiEndpoint = effectiveMetadata.apiEndpoint ?? 'messages.create';
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
            usage: {
              prompt_tokens: usage.input_tokens ?? 0,
              completion_tokens: usage.output_tokens ?? 0,
              total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
            },
          }).catch((err) => {
            if (process.env.NODE_ENV !== 'production') {
              console.error('Langfuse log failed', err);
            }
          });
        } catch {
          // ignore Langfuse logging errors
        }

        return result;
      } finally {
        clearTimeout(t);
      }
    },
  };
}
