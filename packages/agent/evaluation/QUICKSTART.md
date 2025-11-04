# Quick Start: Testing Goal Extraction with Real ChatGPT API

## Prerequisites

1. **OpenAI API Key**: Get one from https://platform.openai.com/api-keys
2. **Environment Setup**: Add to your `.env` file in project root:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   ```

## Running Tests

### Option 1: Using pnpm script (Recommended)
```bash
# From project root
pnpm --filter @quikday/agent test:goals
```

### Option 2: Direct execution
```bash
# From project root
pnpm tsx packages/agent/evaluation/test-goal-generation.ts

# Or from packages/agent directory
cd packages/agent
pnpm test:goals
```

## What Gets Tested

The script runs goal extraction on **30 test cases** covering:
- ✉️ Email operations (drafts, follow-ups, filters)
- 📅 Calendar management (scheduling, conflicts, blocks)
- 💬 Messaging (Slack threads, DMs, summaries)
- 🔄 Workflow automation (triage, sweeps, digests)

## Configuration

**Automatically set:**
- Model: `gpt-4o-mini` (cost-effective, fast)
- Temperature: 0 (deterministic results)
- Timezone: `Europe/Berlin`
- Max tokens: 800
- Rate limit: 500ms delay between tests

## Expected Output

```
================================================================================
Goal Generation Test Suite
================================================================================

Total test cases: 30
Timezone: Europe/Berlin
Model: gpt-4o-mini

[1/30] Testing: email-draft-followup
Input: "Draft a follow-up email to john@example.com about the Q4 strategy..."
✅ Success (1234ms)
   Outcome: Draft and send follow-up email
   Confidence: 0.85
   Domains: email
   Provided fields: 3
   Missing fields: 0

...

================================================================================
Test Summary
================================================================================
Total: 30
✅ Passed: 28 (93.3%)
❌ Failed: 2 (6.7%)

Metrics:
  Avg Duration: 1250ms
  Avg Prompt Length: 3200 chars (~800 tokens)
  Avg Confidence: 0.82

Domain Distribution:
  email: 15 tests
  calendar: 10 tests
  messaging: 5 tests

Results saved to: packages/agent/evaluation/test-results.json
```

## Understanding Results

### Success Metrics
- **Pass Rate**: % of tests that successfully extract valid JSON matching schema
- **Confidence**: Model's certainty (0.0-1.0, higher is better)
- **Duration**: Time to extract goal (lower is better)
- **Prompt Length**: Token efficiency (modular system saves 18-50%)

### Failure Modes
- **Invalid JSON**: Output doesn't parse as JSON
- **Schema Validation**: JSON doesn't match GoalSchema
- **API Errors**: OpenAI API issues (rate limits, timeouts)

### Domain Detection
Tests validate that the system correctly identifies:
- `email`: Email-related tasks
- `calendar`: Calendar operations
- `social`: Social media posts
- `messaging`: Chat/Slack operations

## Viewing Detailed Results

Results are saved to `packages/agent/evaluation/test-results.json`:

```json
[
  {
    "id": "email-draft-followup",
    "input": "Draft a follow-up email to john@example.com...",
    "success": true,
    "goal": {
      "outcome": "Draft and send follow-up email",
      "confidence": 0.85,
      "provided": {
        "recipient": "john@example.com",
        "subject": "Follow-up: Q4 Strategy Deck"
      },
      "missing": []
    },
    "domains": ["email"],
    "promptLength": 3200,
    "duration": 1234
  }
]
```

## Cost Estimation

- **Model**: gpt-4o-mini
- **Input**: ~800 tokens per test
- **Output**: ~200 tokens per test
- **Total**: ~1000 tokens × 30 tests = 30,000 tokens
- **Cost**: ~$0.005 per test run (at current pricing)

## Troubleshooting

### "OPENAI_API_KEY environment variable is not set"
**Solution**: Add your API key to `.env` file or export it:
```bash
export OPENAI_API_KEY=sk-your-key-here
```

### "Cannot find module 'openai'"
**Solution**: Install dependencies:
```bash
pnpm install
```

### Rate limit errors
**Solution**: Tests already include 500ms delay. If still hitting limits:
1. Reduce test count temporarily
2. Increase delay in `test-goal-generation.ts`
3. Check your OpenAI account rate limits

### All tests failing with same error
**Solution**: Check:
1. API key is valid and has credits
2. Network connection is stable
3. OpenAI API status: https://status.openai.com

## Next Steps

After running tests:

1. **Review Results**: Check `test-results.json` for detailed extraction data
2. **Analyze Failures**: Investigate any failed test cases
3. **Compare Outcomes**: Validate extracted goals match expected outcomes in `golden-utterances.ts`
4. **Iterate Prompts**: Refine domain-specific rules based on results
5. **Run Regression**: Re-test after prompt changes to catch regressions

## Files Modified

- `packages/agent/evaluation/test-goal-generation.ts` - Test runner (uses real OpenAI API)
- `packages/agent/package.json` - Added `test:goals` script
- `packages/agent/evaluation/README.md` - Full evaluation documentation

---

**Ready to test?** Run: `pnpm --filter @quikday/agent test:goals`
