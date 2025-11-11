# Model Configuration Refactor

## Summary

Refactored hardcoded LLM model references to use the centralized config and factory pattern.

## Changes Made

### 1. **packages/agent/llm/openai.ts**
- Added `loadLLMConfig` import
- Replaced hardcoded `DEFAULT_MODEL = 'gpt-4o'` with `getDefaultModel()` function
- Now reads from config: `config.openai?.model || config.azure?.deployment || 'gpt-4o'`
- Maintains fallback to `gpt-4o` if config not available

### 2. **packages/agent/llm/anthropic.ts**
- Added `loadLLMConfig` import
- Replaced hardcoded `DEFAULT_MODEL = 'claude-3-5-haiku-20241022'` with `getDefaultModel()` function
- Now reads from config: `config.anthropic?.model || 'claude-3-5-haiku-20241022'`
- Maintains fallback to `claude-3-5-haiku-20241022` if config not available

### 3. **packages/agent/nodes/planner.ts**
- Removed hardcoded `model: 'gpt-4o'` from LLM call metadata
- Added `loadLLMConfig` import to access configuration
- Changed to use provider-agnostic `PLANNER_MODEL` env var (works with OpenAI, Azure, or Anthropic)
- Falls back to provider's default model from config/factory if `PLANNER_MODEL` not set
- **Breaking change**: `OPENAI_PLANNER_MODEL` replaced with `PLANNER_MODEL` for consistency

### 4. **packages/agent/evaluation/test-goal-generation.ts**
- Changed hardcoded `model: 'gpt-4o-mini'` to `model: process.env.OPENAI_MODEL || 'gpt-4o-mini'`
- Updated console log to show actual model being used from env var
- Allows test suite to use configured model instead of always gpt-4o-mini

## How Models Are Now Selected

### Priority Order:
1. **Metadata override** (e.g., `PLANNER_MODEL` for planner calls)
2. **Provider default from config** (from `loadLLMConfig()`)
3. **Hardcoded fallback** (as last resort if config loading fails)

### Example Flow:
```typescript
// For OpenAI
const config = loadLLMConfig();
// Uses: config.openai?.model (from OPENAI_MODEL env var)
// Falls back to: 'gpt-4o'

// For Anthropic
const config = loadLLMConfig();
// Uses: config.anthropic?.model (from ANTHROPIC_MODEL env var)
// Falls back to: 'claude-3-5-haiku-20241022'

// For Azure OpenAI
const config = loadLLMConfig();
// Uses: config.azure?.deployment (from AZURE_OPENAI_DEPLOYMENT env var)
// Falls back to: OPENAI_MODEL or 'gpt-4o'
```

## Environment Variables

All model selection now respects these env vars (in priority order):

1. **PLANNER_MODEL** - Provider-agnostic override for planner node (works with OpenAI, Azure, or Anthropic)
2. **OPENAI_MODEL** - Default for OpenAI provider (default: `gpt-4o`)
3. **AZURE_OPENAI_DEPLOYMENT** - Default for Azure OpenAI (default: falls back to OPENAI_MODEL)
4. **ANTHROPIC_MODEL** - Default for Anthropic (default: `claude-3-5-haiku-20241022`)

### Breaking Change

- **REMOVED**: `OPENAI_PLANNER_MODEL` (provider-specific)
- **NEW**: `PLANNER_MODEL` (provider-agnostic, works with any provider)

## Benefits

✅ **Centralized configuration** - All models configured in one place (`llm/config.ts`)
✅ **Factory pattern** - `createLLM()` handles provider selection and model defaults
✅ **Flexibility** - Can override per-call via metadata if needed
✅ **Consistency** - All components use same configuration source
✅ **Testing** - Test suite respects configured model
✅ **Type safety** - Config validation ensures correct setup

## Database Schema Note

The database schema still has:
```prisma
model String @default("gpt-4o-mini")
```

This is appropriate as it's the actual value stored in the database for logged LLM generations. This is independent of the runtime model selection and serves as a default when no model is specified in the generation metadata.

## Next Steps (Optional)

- [ ] Consider adding model override per team/user in database
- [ ] Add model validation to ensure requested model is available for provider
- [ ] Add model cost tracking based on which model was used
- [ ] Consider adding model fallback strategy (e.g., if primary fails, try secondary)

---

**Date**: November 11, 2025  
**Branch**: refactor-frontend  
**Related Files**:
- `packages/agent/llm/config.ts` (config source)
- `packages/agent/llm/factory.ts` (factory pattern)
- `packages/agent/llm/openai.ts` (OpenAI implementation)
- `packages/agent/llm/anthropic.ts` (Anthropic implementation)
- `packages/agent/nodes/planner.ts` (planner node)
