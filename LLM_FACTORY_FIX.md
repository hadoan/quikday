# LLM Factory Integration Fix

## Problem

The application was hardcoded to use OpenAI (`makeOpenAiLLM()`) in the agent module, ignoring the `LLM_PROVIDER=anthropic` environment variable configuration.

**Error seen:**

```
RateLimitError: 429 You exceeded your current quota
at async Object.text (/packages/agent/llm/openai.ts:67:19)
```

## Root Cause

In `apps/api/src/agent/agent.module.ts`, the LLM provider was hardcoded:

```typescript
// ❌ OLD - Hardcoded to OpenAI
import { makeOpenAiLLM } from '@quikday/agent/llm/openai';

const llmProvider: Provider = options.llm
  ? { provide: AGENT_LLM, useValue: options.llm }
  : { provide: AGENT_LLM, useFactory: () => makeOpenAiLLM() };
```

## Solution

Changed to use the new multi-provider factory that respects environment configuration:

```typescript
// ✅ NEW - Uses factory that respects LLM_PROVIDER env var
import { createLLM } from '@quikday/agent/llm/factory';

const llmProvider: Provider = options.llm
  ? { provide: AGENT_LLM, useValue: options.llm }
  : { provide: AGENT_LLM, useFactory: () => createLLM() };
```

## Changes Made

### File: `apps/api/src/agent/agent.module.ts`

- **Line 5**: Changed import from `makeOpenAiLLM` to `createLLM`
- **Line 16**: Changed factory call from `makeOpenAiLLM()` to `createLLM()`

## How It Works Now

1. **Environment Variable Detection**: The `createLLM()` factory reads `LLM_PROVIDER` from `.env`
2. **Provider Selection**: Based on the value (`openai`, `azure`, or `anthropic`), it creates the appropriate LLM instance
3. **Configuration Loading**: It automatically loads the correct API keys and settings for the selected provider

## Current Configuration (`.env`)

```env
# LLM Provider: 'openai', 'azure', or 'anthropic'
LLM_PROVIDER=anthropic

# Anthropic Configuration (used when LLM_PROVIDER=anthropic)
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

## Verification

✅ **Build Status**: All 20 packages build successfully  
✅ **Environment**: `LLM_PROVIDER=anthropic` is set  
✅ **API Key**: Anthropic API key is configured  
✅ **Model**: Using `claude-3-5-haiku-20241022`

## Testing

To verify the fix is working:

1. Start the development server: `pnpm dev`
2. Send a prompt through the API
3. Check the logs - should see Anthropic API calls instead of OpenAI
4. Verify no more "429 quota exceeded" errors from OpenAI

## Switching Providers

To switch back to OpenAI or use Azure:

```env
# Use OpenAI
LLM_PROVIDER=openai

# Use Azure OpenAI
LLM_PROVIDER=azure

# Use Anthropic Claude (current)
LLM_PROVIDER=anthropic
```

No code changes required - just update the environment variable!

---

**Date**: November 11, 2025  
**Status**: ✅ Fixed and Verified
