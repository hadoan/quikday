# Agent Prompts

This folder contains all LLM prompts used throughout the agent package, organized by purpose and structured for maintainability.

## Philosophy

**Keep prompts modular, versioned, and testable.** Don't create mega-prompts that are hard to maintain. Instead:

1. **Modular Components**: Core contracts, domain packs, format rules, examples
2. **Schema-Enforced**: Use Zod schemas + structured output instead of prose
3. **Code-Based Guardrails**: Validation logic lives in code, not in prompt text
4. **Versioned**: Each rule module is versioned (v1, v2, etc.) for A/B testing
5. **Runtime Compilation**: Compose only what's needed per request

## Structure

### Legacy Prompts (being migrated)
- **System Prompts**: Define the AI's role and behavior (e.g., `FOLLOWUP_EMAIL_SYSTEM.ts`)
- **User Prompt Templates**: Generate contextual user prompts (e.g., `FOLLOWUP_EMAIL_USER_PROMPT.ts`)
- **Prompt Builders**: Functions that construct prompts dynamically (e.g., `buildClassifyUserPrompt`)

### Modular System (new)
```
prompts/
├── goal-extraction/
│   ├── schema.ts              # Zod schema for output structure
│   ├── compiler.ts            # Runtime prompt composer
│   ├── v1-core-contract.ts    # Core behavior (rarely changes)
│   ├── v1-format-rules.ts     # Date/email/number formats
│   ├── v1-integration-policy.ts # Connected apps policy
│   ├── v1-examples.ts         # Few-shot learning examples
│   └── domains/
│       ├── email-v1.ts        # Email-specific rules
│       ├── calendar-v1.ts     # Calendar-specific rules
│       ├── social-v1.ts       # Social media rules
│       └── messaging-v1.ts    # Slack/Teams rules
└── evaluation/
    ├── framework.ts           # Eval loop infrastructure
    └── golden-utterances.ts   # Test cases for regression testing
```

## Usage

### Import from central index
```typescript
import { 
  compileGoalExtractionPrompt,
  compileGoalUserPrompt,
  detectDomains 
} from '@quikday/agent/prompts';
```

### Using the Modular System
```typescript
// 1. Detect domains from user input
const domains = detectDomains(userInput); // ['email', 'calendar']

// 2. Get connected apps (from user's integrations)
const connectedApps = ['gmail', 'google-calendar', 'slack'];

// 3. Compile system prompt with only relevant rules
const systemPrompt = compileGoalExtractionPrompt({
  connectedApps,
  domains,
  includeExamples: true,
  version: 'v1',
});

// 4. Build user prompt with context
const userPrompt = compileGoalUserPrompt(userInput, answers, {
  timezone: 'America/New_York',
  todayISO: new Date().toISOString(),
});

// 5. Call LLM with compiled prompts
const response = await llm.text({
  system: systemPrompt,
  user: userPrompt,
  temperature: 0,
});
```

### Using Legacy System Prompts
```typescript
const response = await llm.text({
  system: FOLLOWUP_EMAIL_SYSTEM,
  user: 'Write a follow-up email...',
});
```

## Best Practices

### 1. Keep Core Contract Stable
The core contract (task definition, output format) should rarely change. When it does, create a new version:
- `v1-core-contract.ts` → `v2-core-contract.ts`

### 2. Domain Packs Change Sometimes
Domain-specific rules (Gmail, Calendar, Slack) evolve as integrations improve. Version them independently:
- `email-v1.ts` → `email-v2.ts`

### 3. Examples are Testable
Few-shot examples should come from real production logs. Add them to `golden-utterances.ts` for regression testing.

### 4. Enforce Structure with Schema
Use JSON Schema/Zod + structured output (function calling/JSON mode) to force format adherence:
```typescript
export const GoalSchema = z.object({
  outcome: z.string(),
  context: z.object({...}).optional(),
  provided: z.record(z.unknown()),
  missing: z.array(...).optional(),
});
```

### 5. Guardrails in Code, Not Prose
Instead of "validate email format", use regex in code:
```typescript
import { validateEmail } from '../guards/validators';

const result = validateEmail(email);
if (!result.valid) {
  // Add to missing fields
}
```

### 6. Runtime Compilation
Compose only what's needed instead of pasting everything:
```typescript
const prompt = compileGoalExtractionPrompt({
  domains: ['email'], // Only include email rules
  connectedApps: ['gmail'],
  includeExamples: true,
});
```

### 7. Evaluation Loop
Create 20–50 golden utterances from logs. For each prompt change:
- Run offline eval → measure valid JSON rate, schema pass, missing fields accuracy
- If a prompt edit fixes <2 failures, move it to code (parser/repair) instead

## Evaluation Framework

Test prompt changes against golden utterances before deploying:

```bash
# View golden test cases
pnpm tsx packages/agent/evaluation/golden-utterances.ts

# Run evaluation (TODO: implement)
pnpm eval:prompts
```

## Migration Guide

To migrate a legacy prompt to the modular system:

1. **Extract Core Logic**: Identify unchanging rules → `vX-core-contract.ts`
2. **Separate Domain Rules**: Split domain-specific guidance → `domains/[domain]-vX.ts`
3. **Create Schema**: Define output structure with Zod → `schema.ts`
4. **Build Compiler**: Add to `compiler.ts` for runtime composition
5. **Add Guardrails**: Move validation from prose to `guards/validators.ts`
6. **Create Test Cases**: Add examples to `evaluation/golden-utterances.ts`
7. **Update Usage**: Replace inline prompts with compiler calls

## Version History

### v1 (Current)
- Initial modular system for goal extraction
- Separated core contract, format rules, integration policy
- Domain packs: email, calendar, social, messaging
- Runtime compiler with domain detection
- Code-based guardrails for email/datetime validation

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
