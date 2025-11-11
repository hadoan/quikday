/**
 * LLM (Large Language Model) abstraction layer
 *
 * Provides a unified interface for different LLM providers (OpenAI, Azure, Anthropic).
 * Use the factory function `createLLM()` to get an LLM instance based on environment configuration.
 *
 * @module llm
 */

export type { LLM, LLMProvider, LlmCallMetadata } from './types.js';
export type { LLMConfig } from './config.js';
export { createLLM, getAvailableProviders } from './factory.js';
export {
  loadLLMConfig,
  validateLLMConfig,
  detectProvider,
  getProviderDisplayName,
  logLLMConfig,
} from './config.js';
export { makeOpenAiLLM } from './openai.js';
export { makeAnthropicLLM } from './anthropic.js';
