# LLM Module

Unified interface for multiple LLM providers in Quik.day agent system.

## Supported Providers

- **OpenAI** - GPT-4, GPT-4o, etc.
- **Azure OpenAI** - Enterprise-grade OpenAI deployment
- **Anthropic Claude** - Claude 3.5 Haiku (default), Claude 3.5 Sonnet, etc.

## Quick Start

### Using the Factory (Recommended)

The simplest way to get started:

```typescript
import { createLLM } from '@quikday/agent/llm';

// Auto-detects provider from environment variables
const llm = createLLM();

const response = await llm.text({
  system: 'You are a helpful assistant.',
  user: 'What is the capital of France?',
  metadata: {
    userId: 123,
    runId: 'run_abc',
  },
});

console.log(response); // "Paris is the capital of France."
```

### Explicit Provider Selection

```typescript
import { createLLM } from '@quikday/agent/llm';

// Use Claude explicitly
const claudeLLM = createLLM('anthropic');

// Use OpenAI explicitly
const openaiLLM = createLLM('openai');

// Use Azure OpenAI explicitly
const azureLLM = createLLM('azure-openai');
```

### Direct Provider Import

```typescript
import { makeOpenAiLLM, makeAnthropicLLM } from '@quikday/agent/llm';

// Create OpenAI instance
const openai = makeOpenAiLLM();

// Create Claude instance
const claude = makeAnthropicLLM();
```

## Environment Variables

### Provider Selection

The system automatically detects which provider to use based on available configuration:

1. **LLM_PROVIDER** environment variable (highest priority)
2. **USE_AZURE_OPENAI=true** (legacy support)
3. Auto-detection based on available API keys

```bash
# Explicitly set provider (recommended)
LLM_PROVIDER=anthropic  # Options: 'openai', 'azure', 'anthropic', 'claude'

# Legacy Azure support (deprecated - use LLM_PROVIDER=azure instead)
USE_AZURE_OPENAI=true
```

### OpenAI Configuration

Required when `LLM_PROVIDER=openai` or when OPENAI_API_KEY is set:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o  # Optional, defaults to gpt-4o
```

### Azure OpenAI Configuration

Required when `LLM_PROVIDER=azure`:

```bash
USE_AZURE_OPENAI=true
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-08-01-preview  # Optional
AZURE_OPENAI_DEPLOYMENT=gpt-4o  # Optional
```

### Anthropic (Claude) Configuration

Required when `LLM_PROVIDER=anthropic`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022  # Optional, defaults to Haiku 4.5

# Supported models:
# - claude-3-5-haiku-20241022 (fastest, cost-effective)
# - claude-3-5-sonnet-20241022 (balanced performance)
# - claude-3-opus-20240229 (most capable)
```

### Observability

```bash
# Database logging (optional)
DATABASE_URL=postgresql://...

# Langfuse observability (optional)
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
```

## Provider Auto-Detection

If `LLM_PROVIDER` is not set, the system auto-detects in this order:

1. If `USE_AZURE_OPENAI=true` → uses Azure OpenAI
2. If `ANTHROPIC_API_KEY` is set and `OPENAI_API_KEY` is not → uses Anthropic
3. Otherwise → uses OpenAI

## API Reference

### `createLLM(provider?: LLMProvider): LLM`

Factory function to create an LLM instance.

**Parameters:**

- `provider` (optional): `'openai'` | `'azure-openai'` | `'anthropic'`

**Returns:** `LLM` instance

### `getAvailableProviders(): LLMProvider[]`

Returns list of available providers based on configured API keys.

```typescript
import { getAvailableProviders } from '@quikday/agent/llm';

const providers = getAvailableProviders();
console.log(providers); // ['openai', 'anthropic']
```

### `LLM.text(options): Promise<string>`

Generate text completion.

**Options:**

- `system?: string` - System prompt
- `user: string` - User prompt (required)
- `temperature?: number` - Default: 0.2
- `maxTokens?: number` - Default: 300
- `timeoutMs?: number` - Default: 15000
- `metadata?: LlmCallMetadata` - Tracking metadata

**Example:**

```typescript
const response = await llm.text({
  system: 'You are a helpful assistant.',
  user: 'Explain quantum computing in one sentence.',
  temperature: 0.7,
  maxTokens: 100,
  metadata: {
    userId: 123,
    teamId: 456,
    runId: 'run_xyz',
    model: 'claude-3-5-haiku-20241022', // Override default model
  },
});
```

## Model Override

You can override the default model per request:

```typescript
// Use Claude Sonnet instead of default Haiku
const response = await llm.text({
  user: 'Complex reasoning task...',
  metadata: {
    userId: 123,
    model: 'claude-3-5-sonnet-20241022',
  },
});

// Use GPT-4o mini for simpler tasks
const response = await llm.text({
  user: 'Simple classification task...',
  metadata: {
    userId: 123,
    model: 'gpt-4o-mini',
  },
});
```

## Context Management

Use `withLlmContext` to set metadata for all LLM calls within a scope:

```typescript
import { createLLM, withLlmContext } from '@quikday/agent/llm';

const llm = createLLM();

await withLlmContext({ userId: 123, teamId: 456, runId: 'run_xyz' }, async () => {
  // All LLM calls within this scope automatically include the context
  const response1 = await llm.text({ user: 'First question' });
  const response2 = await llm.text({ user: 'Second question' });
});
```

## Adding New Providers

To add a new LLM provider:

1. Create a new file: `packages/agent/llm/your-provider.ts`
2. Implement the `LLM` interface from `types.ts`
3. Add the provider to `LLMProvider` type in `types.ts`
4. Update the factory in `factory.ts`
5. Export from `index.ts`

**Example structure:**

```typescript
// your-provider.ts
import type { LLM } from './types.js';

export function makeYourProviderLLM(): LLM {
  return {
    async text({ system, user, temperature, maxTokens, timeoutMs, metadata }) {
      // Implementation
      return 'response text';
    },
  };
}
```

## Observability

All LLM calls are automatically logged to:

1. **Database** (if `DATABASE_URL` is configured and `metadata.userId` is provided)
2. **Langfuse** (if Langfuse keys are configured)

Logged data includes:

- Prompt and completion
- Token usage
- Model used
- User/team/run IDs
- Timestamps

## Testing

```typescript
import { makeAnthropicLLM } from '@quikday/agent/llm';
import Anthropic from '@anthropic-ai/sdk';

// Mock client for testing
const mockClient = new Anthropic({ apiKey: 'test-key' });
const llm = makeAnthropicLLM(mockClient);

// Run tests
```

## Performance Considerations

### Model Selection

- **Claude 3.5 Haiku** (`claude-3-5-haiku-20241022`)
  - Fast and cost-effective
  - Best for: Classification, simple reasoning, high-throughput tasks
  - Default for most Quik.day operations

- **Claude 3.5 Sonnet** (`claude-3-5-sonnet-20241022`)
  - More powerful reasoning
  - Best for: Complex analysis, multi-step reasoning, creative tasks

- **GPT-4o** (`gpt-4o`)
  - Multimodal, fast
  - Best for: General purpose, function calling, structured outputs

- **GPT-4o mini** (`gpt-4o-mini`)
  - Lightweight, cost-effective
  - Best for: Simple tasks, high-volume operations

### Timeouts

Default timeout is 15 seconds. Adjust based on task complexity:

```typescript
// Short timeout for simple tasks
await llm.text({ user: 'yes or no', timeoutMs: 5000 });

// Longer timeout for complex reasoning
await llm.text({ user: 'complex analysis...', timeoutMs: 30000 });
```

## License

GNU Affero General Public License v3.0 (AGPL-3.0)
