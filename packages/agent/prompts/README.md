# Agent Prompts

This folder contains all LLM prompts used throughout the agent package, organized by purpose.

## Structure

- **System Prompts**: Define the AI's role and behavior (e.g., `FOLLOWUP_EMAIL_SYSTEM.ts`)
- **User Prompt Templates**: Generate contextual user prompts (e.g., `FOLLOWUP_EMAIL_USER_PROMPT.ts`)
- **Prompt Builders**: Functions that construct prompts dynamically (e.g., `buildClassifyUserPrompt`)

## Usage

### Import from central index
```typescript
import { FOLLOWUP_EMAIL_SYSTEM, FOLLOWUP_EMAIL_USER_PROMPT } from '@quikday/agent/prompts';
```

### Using System Prompts
```typescript
const response = await llm.text({
  system: FOLLOWUP_EMAIL_SYSTEM,
  user: 'Write a follow-up email...',
});
```

### Using Prompt Templates
```typescript
const userPrompt = FOLLOWUP_EMAIL_USER_PROMPT({
  tone: 'polite',
  originalSubject: 'Project Update',
  recipient: 'john@example.com',
  threadContext: 'Previous email content...',
});

const response = await llm.text({
  system: FOLLOWUP_EMAIL_SYSTEM,
  user: userPrompt,
});
```

## Best Practices

1. **Separation of Concerns**: Keep system prompts separate from user prompts
2. **Type Safety**: Use TypeScript interfaces for prompt parameters
3. **Reusability**: Create template functions for prompts that need dynamic content
4. **Documentation**: Include JSDoc comments explaining the prompt's purpose
5. **Versioning**: When updating prompts, consider backward compatibility

## Adding New Prompts

1. Create a new `.ts` file with a descriptive name (e.g., `TASK_DECOMPOSITION_SYSTEM.ts`)
2. Export a constant or function:
   ```typescript
   export const MY_SYSTEM_PROMPT = `You are a...`;
   // or
   export const MY_USER_PROMPT = (params: { ... }) => `...`;
   ```
3. Add export to `index.ts`
4. Import and use in your tool/node

## Existing Prompts

### Classification
- `CLASSIFY_SYSTEM` - Intent classification system prompt
- `CLASSIFY_USER_PROMPT` - Builds user prompt for intent detection

### Planning
- `PLANNER_SYSTEM` - Action planner system prompt

### Email Follow-ups
- `FOLLOWUP_EMAIL_SYSTEM` - Email writing assistant system prompt
- `FOLLOWUP_EMAIL_USER_PROMPT` - Template for follow-up email generation

### General
- `DEFAULT_ASSISTANT_SYSTEM` - Fallback assistant prompt
- `SUMMARIZE_SYSTEM` - Run summarization system prompt

## Testing

When updating prompts, test with various inputs to ensure:
- Output quality and consistency
- Token usage is reasonable
- Edge cases are handled
- Tone and style match expectations
