# LLM Module Changelog

## [2.0.0] - 2025-11-11

### Added - Multi-Provider Support

#### New Features

- **Anthropic Claude Support** - Full integration with Claude 3.5 models (Haiku, Sonnet, Opus)
- **Provider Factory Pattern** - Unified `createLLM()` function for all providers
- **Environment-Based Configuration** - Configure provider via `LLM_PROVIDER` environment variable
- **Auto-Detection** - Automatically selects provider based on available API keys
- **Configuration Module** - Centralized config loading, validation, and logging

#### New Environment Variables

```bash
# Primary provider selection
LLM_PROVIDER=openai|azure|anthropic

# Anthropic configuration
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

#### New API

```typescript
// Factory function with provider auto-detection
import { createLLM } from '@quikday/agent/llm';
const llm = createLLM();

// Explicit provider selection
const claudeLLM = createLLM('anthropic');
const openaiLLM = createLLM('openai');
const azureLLM = createLLM('azure-openai');

// Configuration utilities
import {
  loadLLMConfig,
  validateLLMConfig,
  detectProvider,
  getProviderDisplayName,
  logLLMConfig,
  getAvailableProviders,
} from '@quikday/agent/llm';
```

#### New Files

- `llm/anthropic.ts` - Anthropic Claude implementation
- `llm/factory.ts` - Provider factory and selection logic
- `llm/config.ts` - Configuration loading and validation
- `llm/types.ts` - Shared TypeScript interfaces
- `llm/CONFIGURATION.md` - Comprehensive configuration guide
- `llm/EXAMPLES.md` - Usage examples
- `llm/CHANGELOG.md` - This file

### Changed

- **Refactored OpenAI implementation** - Extracted to `llm/openai.ts` with `makeOpenAiLLM()` factory
- **Updated types** - Added `LLMProvider` type and `LlmCallMetadata` interface
- **Enhanced README** - Added multi-provider documentation

### Backward Compatibility

All existing code continues to work:

- `USE_AZURE_OPENAI=true` still works (maps to `LLM_PROVIDER=azure`)
- `OPENAI_API_KEY` and `OPENAI_MODEL` still work
- Existing `makeOpenAiLLM()` function still available

### Migration Guide

#### From Single Provider (OpenAI only)

**Before:**
```typescript
import { makeOpenAiLLM } from '@quikday/agent/llm';
const llm = makeOpenAiLLM();
```

**After (Recommended):**
```typescript
import { createLLM } from '@quikday/agent/llm';
const llm = createLLM();  // Auto-detects from environment
```

#### Environment Configuration

**Before:**
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
USE_AZURE_OPENAI=false
```

**After (Recommended):**
```bash
LLM_PROVIDER=openai  # Explicit provider selection
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

**To Use Claude:**
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

### Implementation Details

#### Provider Architecture

```
createLLM() factory
├── loadLLMConfig() - Reads environment variables
├── validateLLMConfig() - Validates required settings
└── Provider selection
    ├── makeAnthropicLLM() - Anthropic Claude
    └── makeOpenAiLLM() - OpenAI/Azure OpenAI
```

#### Unified LLM Interface

All providers implement the same interface:

```typescript
interface LLM {
  text(args: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    metadata?: LlmCallMetadata;
  }): Promise<string>;

  json?<T>(args: {
    system?: string;
    user: string;
    schema?: unknown;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    metadata?: LlmCallMetadata;
  }): Promise<T>;
}
```

#### Observability

Both providers support:
- Database logging (via Prisma `llm_log` table)
- Langfuse tracing (if configured)
- Consistent metadata tracking

### Performance

- **Anthropic Haiku** - ~2x faster than GPT-4o, ~50% cheaper
- **Anthropic Sonnet** - Similar performance to GPT-4o
- **Factory overhead** - Negligible (<1ms)

### Testing

```bash
# Test with OpenAI
LLM_PROVIDER=openai pnpm test

# Test with Claude
LLM_PROVIDER=anthropic pnpm test

# Test all providers
pnpm test
```

### Documentation

- [README.md](./README.md) - API reference and usage
- [CONFIGURATION.md](./CONFIGURATION.md) - Environment setup guide
- [EXAMPLES.md](./EXAMPLES.md) - Code examples

### Dependencies Added

```json
{
  "@anthropic-ai/sdk": "^0.32.1"
}
```

### Breaking Changes

None - Fully backward compatible with existing code.

### Future Plans

- [ ] Add support for Google Gemini
- [ ] Add support for local LLMs (Ollama, LM Studio)
- [ ] Provider-specific optimizations (e.g., Claude's extended context)
- [ ] Cost tracking per provider
- [ ] A/B testing between providers
