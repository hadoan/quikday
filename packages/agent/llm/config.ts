import type { LLMProvider } from './types.js';

/**
 * LLM Configuration interface
 */
export interface LLMConfig {
  provider: LLMProvider;
  openai?: {
    apiKey: string;
    model: string;
    baseURL?: string;
  };
  azure?: {
    apiKey: string;
    endpoint: string;
    apiVersion: string;
    deployment: string;
  };
  anthropic?: {
    apiKey: string;
    model: string;
  };
}

/**
 * Load LLM configuration from environment variables
 */
export function loadLLMConfig(): LLMConfig {
  const provider = detectProvider();

  const config: LLMConfig = {
    provider,
  };

  // Load OpenAI config
  if (process.env.OPENAI_API_KEY) {
    config.openai = {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      baseURL: process.env.OPENAI_BASE_URL,
    };
  }

  // Load Azure OpenAI config
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    config.azure = {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview',
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o',
    };
  }

  // Load Anthropic config
  if (process.env.ANTHROPIC_API_KEY) {
    config.anthropic = {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
    };
  }

  return config;
}

/**
 * Detects which LLM provider to use based on environment variables.
 * Priority:
 * 1. LLM_PROVIDER env var (openai, azure, anthropic)
 * 2. USE_AZURE_OPENAI=true → azure-openai (legacy)
 * 3. ANTHROPIC_API_KEY present → anthropic
 * 4. Default to openai
 */
export function detectProvider(): LLMProvider {
  const explicitProvider = process.env.LLM_PROVIDER?.toLowerCase();
  
  if (explicitProvider === 'anthropic' || explicitProvider === 'claude') {
    return 'anthropic';
  }
  
  if (explicitProvider === 'azure-openai' || explicitProvider === 'azure') {
    return 'azure-openai';
  }
  
  if (explicitProvider === 'openai') {
    return 'openai';
  }

  // Legacy support: USE_AZURE_OPENAI=true
  if (process.env.USE_AZURE_OPENAI === 'true') {
    return 'azure-openai';
  }

  // Auto-detect based on available credentials
  if (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return 'anthropic';
  }

  return 'openai';
}

/**
 * Validate that required environment variables are set for the detected provider
 * @throws Error if required variables are missing
 */
export function validateLLMConfig(config: LLMConfig): void {
  switch (config.provider) {
    case 'openai':
      if (!config.openai?.apiKey) {
        throw new Error(
          'OpenAI API key is required. Set OPENAI_API_KEY environment variable.',
        );
      }
      break;

    case 'azure-openai':
      if (!config.azure?.apiKey || !config.azure?.endpoint) {
        throw new Error(
          'Azure OpenAI configuration is incomplete. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables.',
        );
      }
      break;

    case 'anthropic':
      if (!config.anthropic?.apiKey) {
        throw new Error(
          'Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable.',
        );
      }
      break;

    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(provider: LLMProvider): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'azure-openai':
      return 'Azure OpenAI';
    case 'anthropic':
      return 'Anthropic Claude';
    default:
      return provider;
  }
}

/**
 * Log current LLM configuration (safe - doesn't log API keys)
 */
export function logLLMConfig(config: LLMConfig): void {
  console.log(`[LLM Config] Provider: ${getProviderDisplayName(config.provider)}`);
  
  switch (config.provider) {
    case 'openai':
      console.log(`[LLM Config] Model: ${config.openai?.model}`);
      console.log(`[LLM Config] API Key: ${config.openai?.apiKey ? '✓ Set' : '✗ Missing'}`);
      break;

    case 'azure-openai':
      console.log(`[LLM Config] Deployment: ${config.azure?.deployment}`);
      console.log(`[LLM Config] Endpoint: ${config.azure?.endpoint}`);
      console.log(`[LLM Config] API Key: ${config.azure?.apiKey ? '✓ Set' : '✗ Missing'}`);
      break;

    case 'anthropic':
      console.log(`[LLM Config] Model: ${config.anthropic?.model}`);
      console.log(`[LLM Config] API Key: ${config.anthropic?.apiKey ? '✓ Set' : '✗ Missing'}`);
      break;
  }
}
