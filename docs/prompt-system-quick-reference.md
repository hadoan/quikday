# Quick Reference: Modular Prompt System

## For Developers

### Import and Use

```typescript
// Goal extraction with modular prompts
import {
  compileGoalExtractionPrompt,
  compileGoalUserPrompt,
  detectDomains,
  GoalSchema,
} from '@quikday/agent/prompts/goal-extraction';

// Validators
import {
  validateEmail,
  validateDateTime,
  filterIntegrationPolicyQuestions,
  repairJsonOutput,
} from '@quikday/agent/guards';

// Evaluation
import { GOLDEN_UTTERANCES, runEvaluation } from '@quikday/agent/evaluation';
```

### Basic Usage

```typescript
// 1. Detect domains
const domains = detectDomains(userInput);

// 2. Compile prompt
const systemPrompt = compileGoalExtractionPrompt({
  connectedApps: ['gmail', 'google-calendar'],
  domains,
  includeExamples: true,
});

const userPrompt = compileGoalUserPrompt(userInput, answers, {
  timezone: 'UTC',
  todayISO: new Date().toISOString(),
});

// 3. Call LLM
const response = await llm.text({ system: systemPrompt, user: userPrompt });

// 4. Parse and validate
const json = repairJsonOutput(response);
let parsed = GoalSchema.parse(JSON.parse(json));

// 5. Apply guardrails
if (parsed.missing) {
  parsed.missing = filterIntegrationPolicyQuestions(parsed.missing, connectedApps);
}
```

## For Prompt Engineers

### Adding a New Domain

1. Create `packages/agent/prompts/goal-extraction/domains/[domain]-v1.ts`:

```typescript
export const [DOMAIN]_DOMAIN_RULES_V1 = [
  '**[Domain] operations:**',
  '- Rule 1',
  '- Rule 2',
].join('\n');
```

2. Import in `compiler.ts`:

```typescript
import { [DOMAIN]_DOMAIN_RULES_V1 } from './domains/[domain]-v1.js';

// Add to domainMap
const domainMap = {
  [domain]: [DOMAIN]_DOMAIN_RULES_V1,
};
```

3. Update `detectDomains()` to recognize keywords:

```typescript
if (/keyword1|keyword2/.test(input)) {
  domains.push('[domain]');
}
```

### Versioning a Component

When making breaking changes:

1. Copy `v1-core-contract.ts` → `v2-core-contract.ts`
2. Make your changes in v2
3. Update compiler to support version option
4. A/B test v1 vs v2 using evaluation framework

### Adding Examples

Add to `v1-examples.ts`:

```typescript
'// User: "[user input]"',
'{',
'  "outcome": "...",',
'  "provided": {...},',
'  "missing": [...],',
'}',
```

And add to golden utterances for testing:

```typescript
// packages/agent/evaluation/golden-utterances.ts
{
  id: 'unique-id',
  input: '[user input]',
  expectedOutcome: '...',
  expectedProvided: {...},
  expectedMissing: ['field1', 'field2'],
  minConfidence: 0.8,
  domains: ['email'],
}
```

## For QA/Testing

### Running Golden Utterances

```bash
# View test cases
pnpm tsx packages/agent/evaluation/golden-utterances.ts

# Run the modular prompt demo
pnpm tsx packages/agent/examples/modular-prompt-demo.ts

# Run evaluation (once implemented)
pnpm --filter @quikday/agent eval:prompts
```

### Adding Test Cases

Edit `packages/agent/evaluation/golden-utterances.ts`:

```typescript
export const GOLDEN_UTTERANCES: GoldenUtterance[] = [
  {
    id: 'test-case-id',
    input: 'User utterance here',
    expectedOutcome: 'What should be extracted',
    expectedProvided: { key: 'value' },
    expectedMissing: ['field1'],
    minConfidence: 0.8,
    domains: ['email', 'calendar'],
    notes: 'Why this test case matters',
  },
  // ... more cases
];
```

## File Structure

```
packages/agent/
├── prompts/
│   ├── goal-extraction/
│   │   ├── schema.ts              # Zod schema
│   │   ├── compiler.ts            # Runtime composer
│   │   ├── v1-core-contract.ts    # Core rules
│   │   ├── v1-format-rules.ts     # Format validation
│   │   ├── v1-integration-policy.ts # Integration rules
│   │   ├── v1-examples.ts         # Few-shot examples
│   │   ├── domains/
│   │   │   ├── email-v1.ts
│   │   │   ├── calendar-v1.ts
│   │   │   ├── social-v1.ts
│   │   │   └── messaging-v1.ts
│   │   └── index.ts               # Exports
│   └── index.ts                   # Central exports
├── guards/
│   ├── validators.ts              # Code-based validation
│   └── index.ts
├── evaluation/
│   ├── framework.ts               # Eval infrastructure
│   ├── golden-utterances.ts       # Test cases
│   └── index.ts
└── nodes/
    └── extractGoal.ts             # Uses modular system
```

## Key Principles

1. **Core contract rarely changes** - Fundamental behavior
2. **Domain packs change sometimes** - Integration-specific rules
3. **Examples are testable** - All in golden utterances
4. **Schema enforces structure** - No format errors
5. **Guardrails in code** - Not in prompt prose
6. **Runtime compilation** - Only include what's needed
7. **Evaluation loop** - Test before deploying

## Common Tasks

### Check Token Count

```typescript
const prompt = compileGoalExtractionPrompt({
  domains: ['email'],
  includeExamples: true,
});
console.log('Tokens:', prompt.length / 4); // Rough estimate
```

### Debug Prompt Output

```typescript
const prompt = compileGoalExtractionPrompt({
  domains: ['email', 'calendar'],
  connectedApps: ['gmail'],
  includeExamples: false,
});
console.log(prompt); // See what's included
```

### Test Single Utterance

```typescript
import { GOLDEN_UTTERANCES } from '@quikday/agent/evaluation';

const testCase = GOLDEN_UTTERANCES.find((u) => u.id === 'schedule-basic');
// Run through extraction and compare results
```

## Next Steps

1. **Implement eval runner** - Complete `runEvaluation()` in framework.ts
2. **Gather production logs** - Extract real utterances for testing
3. **Baseline metrics** - Establish v1 performance benchmarks
4. **Iterate v2** - Improve based on eval results
5. **Migrate other prompts** - Apply pattern to PLANNER_SYSTEM, etc.

---

**Need help?** Check:

- `packages/agent/prompts/README.md` - Full documentation
- `docs/modular-prompt-system.md` - Implementation details
- `packages/agent/evaluation/golden-utterances.ts` - Example test cases
