# LLM Configuration Guide

This guide explains how to configure the LLM provider for your Quik.day deployment.

## Configuration Overview

Quik.day supports multiple LLM providers through a unified interface. You can easily switch between providers by setting environment variables.

## Supported Providers

| Provider             | Models                         | Best For                                        |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| **OpenAI**           | GPT-4o, GPT-4o-mini, GPT-4     | General purpose, widely supported               |
| **Azure OpenAI**     | Same as OpenAI                 | Enterprise deployments, compliance requirements |
| **Anthropic Claude** | Claude 3.5 Haiku, Sonnet, Opus | Cost-effective (Haiku), high quality reasoning  |

## Quick Setup

### Option 1: OpenAI (Default)

```bash
# .env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o  # Optional, defaults to gpt-4o
```

### Option 2: Anthropic Claude

```bash
# .env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022  # Optional, defaults to Haiku
```

### Option 3: Azure OpenAI

```bash
# .env
LLM_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-08-01-preview
AZURE_OPENAI_DEPLOYMENT=gpt-4o
```

## Auto-Detection

If you don't set `LLM_PROVIDER`, the system will auto-detect based on available credentials:

1. If `USE_AZURE_OPENAI=true` → uses Azure OpenAI (legacy support)
2. If `ANTHROPIC_API_KEY` is set and no OpenAI key → uses Anthropic
3. Otherwise → uses OpenAI (default)

## Provider Selection Priority

The system determines which provider to use in this order:

1. **Explicit provider** via `LLM_PROVIDER` environment variable (highest priority)
2. **Legacy Azure flag** via `USE_AZURE_OPENAI=true`
3. **Auto-detection** based on available API keys
4. **Default** to OpenAI

## Model Selection

### OpenAI Models

```bash
OPENAI_MODEL=gpt-4o              # Default - best performance
OPENAI_MODEL=gpt-4o-mini         # Cost-effective
OPENAI_MODEL=gpt-4               # Previous generation
OPENAI_MODEL=gpt-3.5-turbo       # Fastest, cheapest
```

### Anthropic Models

```bash
ANTHROPIC_MODEL=claude-3-5-haiku-20241022    # Default - fast & cost-effective
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022   # Balanced
ANTHROPIC_MODEL=claude-3-opus-20240229       # Most capable
```

### Azure OpenAI Deployments

```bash
# Use your deployment name (not the model name)
AZURE_OPENAI_DEPLOYMENT=my-gpt4o-deployment
```

## Environment Configuration Examples

### Development (OpenAI)

```bash
# .env.development
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-dev-...
OPENAI_MODEL=gpt-4o-mini  # Cheaper for development
```

### Production (Azure OpenAI)

```bash
# .env.production
LLM_PROVIDER=azure
AZURE_OPENAI_API_KEY=${AZURE_OPENAI_KEY}
AZURE_OPENAI_ENDPOINT=https://prod.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o-prod
AZURE_OPENAI_API_VERSION=2024-08-01-preview
```

### Testing (Anthropic Claude)

```bash
# .env.test
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-test-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022  # Fast & affordable for tests
```

## Validation

The system will validate your configuration on startup and throw descriptive errors if required variables are missing:

```typescript
// OpenAI
Error: OpenAI API key is required. Set OPENAI_API_KEY environment variable.

// Azure OpenAI
Error: Azure OpenAI configuration is incomplete. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables.

// Anthropic
Error: Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable.
```

## Runtime Usage

### Basic Usage

```typescript
import { createLLM } from '@quikday/agent/llm';

// Uses provider from environment
const llm = createLLM();

const response = await llm.text({
  user: 'What is 2+2?',
  metadata: { userId: 123 },
});
```

### Explicit Provider

```typescript
import { createLLM } from '@quikday/agent/llm';

// Force Claude even if env says OpenAI
const claudeLLM = createLLM('anthropic');

// Force OpenAI
const openaiLLM = createLLM('openai');
```

### Verbose Logging

```typescript
import { createLLM } from '@quikday/agent/llm';

// Log configuration details on creation
const llm = createLLM(undefined, true);
// Logs:
// [LLM Config] Provider: Anthropic Claude
// [LLM Config] Model: claude-3-5-haiku-20241022
// [LLM Config] API Key: ✓ Set
```

### Check Available Providers

```typescript
import { getAvailableProviders } from '@quikday/agent/llm';

const providers = getAvailableProviders();
// Returns: ['openai', 'anthropic']  (based on configured API keys)
```

### Load Configuration

```typescript
import { loadLLMConfig, logLLMConfig } from '@quikday/agent/llm';

const config = loadLLMConfig();
logLLMConfig(config);
```

## Cost Optimization

### Development

Use cheaper models for development:

```bash
# OpenAI
OPENAI_MODEL=gpt-4o-mini

# Anthropic
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

### Production

Use more capable models where needed:

```bash
# OpenAI
OPENAI_MODEL=gpt-4o

# Anthropic
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## Troubleshooting

### Provider Not Detected

If auto-detection isn't working, explicitly set `LLM_PROVIDER`:

```bash
LLM_PROVIDER=anthropic  # or 'openai', 'azure'
```

### Invalid API Key

Check that your API key format is correct:

- OpenAI: `sk-proj-...` or `sk-...`
- Azure: Any string (from Azure portal)
- Anthropic: `sk-ant-...`

### Model Not Found

For Azure, ensure you're using your **deployment name**, not the model name:

```bash
# ✗ Wrong (this is the base model name)
AZURE_OPENAI_DEPLOYMENT=gpt-4o

# ✓ Correct (this is your deployment name in Azure)
AZURE_OPENAI_DEPLOYMENT=my-gpt4o-prod-deployment
```

For Anthropic, check the [model availability](https://docs.anthropic.com/claude/docs/models-overview):

```bash
# Current models (as of Nov 2024)
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_MODEL=claude-3-opus-20240229
```

## Migration Guide

### From Azure Flag to LLM_PROVIDER

If you're using the legacy `USE_AZURE_OPENAI=true` flag:

**Before:**

```bash
USE_AZURE_OPENAI=true
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=...
```

**After:**

```bash
LLM_PROVIDER=azure  # Explicit provider
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=...
```

The old flag still works for backward compatibility, but we recommend migrating to `LLM_PROVIDER`.

### Switching Providers

To switch providers, just change the `LLM_PROVIDER` variable and ensure the required keys are set:

```bash
# Switch from OpenAI to Claude
LLM_PROVIDER=anthropic  # Change this
# Comment out: OPENAI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...  # Add this
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

No code changes required! The factory function handles everything automatically.

## Best Practices

1. **Use explicit provider selection** - Set `LLM_PROVIDER` rather than relying on auto-detection
2. **Validate on startup** - Call `validateLLMConfig()` early in your application lifecycle
3. **Log configuration** - Use verbose mode or `logLLMConfig()` to verify settings in non-production
4. **Environment-specific configs** - Use different providers/models per environment (dev/staging/prod)
5. **Cost monitoring** - Use cheaper models for development and testing

## See Also

- [README.md](./README.md) - Full API documentation
- [EXAMPLES.md](./EXAMPLES.md) - Usage examples
- [.env.example](../../../.env.example) - Complete environment template
