import type { LLM, LLMProvider } from './types.js';
import { makeOpenAiLLM } from './openai.js';
import { makeAnthropicLLM } from './anthropic.js';
import { loadLLMConfig, validateLLMConfig, logLLMConfig } from './config.js';

/**
 * Factory function to create the appropriate LLM instance based on provider.
 * This is the recommended way to get an LLM instance in the application.
 *
 * @param provider - The LLM provider to use (defaults to environment config)
 * @param verbose - If true, logs configuration details (default: false)
 * @returns LLM instance for the specified provider
 *
 * @example
 * ```typescript
 * // Use default provider from environment
 * const llm = createLLM();
 *
 * // Explicitly use Claude
 * const claudeLLM = createLLM('anthropic');
 *
 * // Explicitly use OpenAI with verbose logging
 * const openaiLLM = createLLM('openai', true);
 * ```
 */
export function createLLM(provider?: LLMProvider, verbose = false): LLM {
  const config = loadLLMConfig();
  const effectiveProvider = provider ?? config.provider;

  // Update config with explicit provider if specified
  if (provider) {
    config.provider = provider;
  }

  // Validate configuration
  validateLLMConfig(config);

  // Always log which provider is being used (critical for debugging)
  console.log(`[LLM Factory] Creating LLM with provider: ${effectiveProvider}`);
  console.log(`[LLM Factory] Config provider detected: ${config.provider}`);
  console.log(`[LLM Factory] LLM_PROVIDER env: ${process.env.LLM_PROVIDER || '(not set)'}`);

  // Log configuration if verbose
  if (verbose) {
    logLLMConfig(config);
  }

  switch (effectiveProvider) {
    case 'anthropic':
      console.log('[LLM Factory] ✅ Using Anthropic Claude');
      return makeAnthropicLLM();

    case 'azure-openai':
      console.log('[LLM Factory] ✅ Using Azure OpenAI');
      return makeOpenAiLLM();

    case 'openai':
      console.log('[LLM Factory] ✅ Using OpenAI');
      return makeOpenAiLLM();

    default:
      throw new Error(`Unsupported LLM provider: ${effectiveProvider}`);
  }
}

/**
 * Get all available LLM providers based on configured API keys
 */
export function getAvailableProviders(): LLMProvider[] {
  const providers: LLMProvider[] = [];

  if (process.env.OPENAI_API_KEY) {
    providers.push('openai');
  }

  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    providers.push('azure-openai');
  }

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push('anthropic');
  }

  return providers;
}
