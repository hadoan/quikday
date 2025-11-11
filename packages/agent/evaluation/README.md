# Goal Extraction Evaluation Suite

This folder contains the evaluation framework for testing the modular prompt system.

## Files

### `golden-utterances.ts`

Contains 30 test cases covering all MVP templates:

- **Triage & Priorities** (3 tests): Quick replies, inbox sprints, time-sensitive threads
- **Follow-ups & Sweeps** (3 tests): No-reply sweeps, starred follow-ups, scheduled nudges
- **Meeting Prep & Recaps** (3 tests): Meeting prep, recaps, pre-meeting emails
- **Scheduling Helpers** (3 tests): Slot proposals, conflict detection, focus blocks
- **Digests & Daily Ops** (3 tests): Daily digests, weekly summaries, action item reminders
- **RSVP & Confirmations** (2 tests): Smart RSVPs, meeting confirmations
- **Out-of-Office & Boundaries** (2 tests): OOO setup, focus time auto-replies
- **Cleanup & Hygiene** (2 tests): Calendar hygiene, newsletter digests
- **Quick Replies & Intros** (2 tests): Scheduled replies, double opt-in intros

Each test case includes:

- `id`: Unique identifier
- `input`: User utterance
- `expectedOutcome`: What the system should extract
- `expectedProvided`: Object with expected extracted values
- `expectedMissing`: Array of fields that should be marked as missing
- `minConfidence`: Minimum confidence threshold (0.7-0.9)
- `domains`: Expected domain detection (email, calendar, social, messaging)
- `notes`: Additional context

### `test-goal-generation.ts`

**Real ChatGPT API test runner** that validates goal extraction against all golden utterances.

**Features:**

- ✅ Uses real OpenAI API (gpt-4o-mini) instead of mocks
- ✅ Berlin timezone support (`Europe/Berlin`)
- ✅ Sequential execution with rate limit protection (500ms delay)
- ✅ Comprehensive metrics:
  - Success/failure rates
  - Average duration per test
  - Average prompt length
  - Average confidence scores
  - Domain distribution
- ✅ Detailed output for each test case
- ✅ Results saved to `test-results.json`

**Usage:**

```bash
# Set your OpenAI API key (or add to .env file in project root)
# For bash/zsh:
export OPENAI_API_KEY=sk-...

# For PowerShell (Windows):
$env:OPENAI_API_KEY="sk-..."

# Run from project root
pnpm --filter @quikday/agent test:goals

# Or run directly from packages/agent
cd packages/agent
pnpm test:goals
```

**Sample Output:**

```
================================================================================
Goal Generation Test Suite
================================================================================

Total test cases: 30
Timezone: Europe/Berlin
Model: gpt-4o-mini

[1/30] Testing: email-draft-followup
Input: "Draft a follow-up email to john@example.com about the Q4 strategy deck"
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

### `framework.ts`

Evaluation framework infrastructure (stub implementation).

**Planned features:**

- `runEvaluation()`: Compare generated goals against expected outcomes
- Metrics collection (accuracy, confidence, field extraction)
- A/B testing for prompt versions
- Regression testing infrastructure

### `test-results.json`

Generated output file containing detailed results from each test run, including:

- Success/failure status
- Extracted goal objects
- Error messages (if any)
- Execution duration
- Domain detection results
- Prompt lengths

## Testing Strategy

### 1. Smoke Test (Current)

Run `test-goal-generation.ts` to verify the system can extract goals from all 30 test cases using real ChatGPT API.

### 2. Validation Test (Next)

Compare extracted goals against `expectedOutcome`, `expectedProvided`, and `expectedMissing` fields to measure accuracy.

### 3. Regression Test (Future)

Run tests on every prompt version change to catch regressions.

### 4. A/B Testing (Future)

Compare multiple prompt versions side-by-side to measure improvements.

## Configuration

The test uses these settings:

- **Model**: `gpt-4o-mini` (fast, cost-effective)
- **Temperature**: 0 (deterministic)
- **Max Tokens**: 800 (sufficient for structured output)
- **Timezone**: `Europe/Berlin`
- **Connected Apps**: gmail, google-calendar, slack
- **Rate Limiting**: 500ms delay between requests

## Metrics Tracked

- **Pass Rate**: % of tests that successfully extract valid goals
- **Average Duration**: Time to extract each goal
- **Average Prompt Length**: Token efficiency of modular system
- **Average Confidence**: Model certainty in extractions
- **Domain Detection**: Coverage across email/calendar/social/messaging
- **Field Extraction**: Accuracy of provided/missing field detection

## Next Steps

1. ✅ **Completed**: Created 30 golden utterances covering all MVP templates
2. ✅ **Completed**: Built test runner with real ChatGPT API integration
3. ⏳ **In Progress**: Run initial validation tests
4. ⏳ **Pending**: Implement outcome comparison logic
5. ⏳ **Pending**: Add field extraction validation
6. ⏳ **Pending**: Build regression testing pipeline
7. ⏳ **Pending**: Set up A/B testing infrastructure

---

**Timezone**: Europe/Berlin  
**Model**: gpt-4o-mini  
**Last Updated**: 2025-01-04
