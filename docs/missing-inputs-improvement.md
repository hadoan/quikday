# Missing Inputs Handling - Analysis & Improvements

## Current Behavior Analysis

### User Request Example
```
Give me a {minutes=10}-minute triage of priority emails and create quick-reply drafts (max {max=8}).
```

### Current Flow Issues

The agent currently follows this flow:

1. **extractGoal** → Extracts goal with `provided` and `missing` fields
2. **confirm** → Should ask questions about missing inputs
3. **planner** → Creates plan OR returns empty plan if required fields missing
4. **ensure_inputs** → Checks for missing required inputs and pauses if needed

### Problems Identified

1. **Inconsistent Missing Field Detection**
   - `extractGoal` may not always detect missing fields correctly
   - Email account credentials are considered "provided" (from connected integrations) but other context might be missed
   - In the example, the agent should detect missing: `email_account`, `tone_preference`, possibly `priority_criteria`

2. **Generic Response Pattern**
   - Current response asks too many open-ended questions
   - Doesn't leverage the structured `missing` fields from goal extraction
   - Response feels like a fallback rather than a guided input collection

3. **Plan Generation with Missing Inputs**
   - Planner returns empty plan when required fields are missing
   - This triggers a generic confirmation message instead of structured questions
   - User doesn't see what specific information is needed

## Proposed Improvements

### 1. Enhanced Goal Extraction

Update `extractGoal` to better identify missing inputs:

```typescript
// In extractGoal.ts - buildGoalExtractionPrompt()

'**Critical: Identifying Missing Information**',
'- Connected integrations provide: email_account, calendar_access, platform_credentials',
'- User must provide: content, recipients, specific instructions, preferences, filters',
'- For triage/filtering tasks, identify: time_window, max_results, priority_criteria',
'- For draft creation, identify: tone, length, context_requirements',
'- For scheduling, identify: attendees, duration, preferred_times',
'',
'**Examples of missing fields:**',
'{',
'  "missing": [',
'    { "key": "time_window_minutes", "question": "How many minutes back should I look?", "type": "number", "required": true },',
'    { "key": "max_results", "question": "Maximum number of emails to triage?", "type": "number", "required": false },',
'    { "key": "priority_criteria", "question": "What makes an email priority? (e.g., from specific senders, keywords, urgency)", "type": "text", "required": false },',
'    { "key": "reply_tone", "question": "What tone for replies? (professional/casual/friendly)", "type": "select", "options": ["professional", "casual", "friendly"], "required": false }',
'  ]',
'}',
```

### 2. Smarter Confirm Node

Update `confirm.ts` to handle missing fields more intelligently:

```typescript
// In confirm.ts

export const confirm: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const goal = (s.scratch as any)?.goal;
  const missing = goal?.missing || [];
  
  // Filter to only required missing fields or high-value optional ones
  const criticalMissing = missing.filter((m: any) => 
    m.required !== false || isHighValueOptional(m, goal)
  );
  
  if (criticalMissing.length > 0) {
    const questions: Question[] = criticalMissing.map((m: any) => ({
      key: m.key,
      question: m.question,
      type: mapToQuestionType(m.type),
      required: m.required !== false,
      options: m.options,
      placeholder: m.placeholder,
    }));
    
    // Provide better context in the awaiting message
    const awaitingReason = {
      reason: 'missing_required_inputs',
      questions,
      context: `To ${goal.outcome}, I need the following information:`,
      ts: new Date().toISOString(),
    };
    
    return {
      scratch: { ...s.scratch, awaiting: awaitingReason },
      output: { ...s.output, awaiting: awaitingReason },
    };
  }
  
  // No missing fields, proceed
  return { scratch: s.scratch, output: s.output };
};

function isHighValueOptional(field: any, goal: any): boolean {
  // Determine if an optional field is important enough to ask about
  const highValueKeys = ['tone', 'max_results', 'priority_criteria', 'time_window'];
  return highValueKeys.some(key => field.key.includes(key));
}
```

### 3. Plan Preview with Missing Inputs

Update `planner.ts` to show a "preview plan" even with missing inputs:

```typescript
// In planner.ts - makePlanner()

// When required fields are missing, show a preview plan
if (requiredMissing.length > 0) {
  // Generate a "preview plan" showing what we'll do once we have the info
  const previewSteps = generatePreviewSteps(goal, requiredMissing);
  
  const diff = safe({
    summary: `Need ${requiredMissing.length} more detail(s) to proceed`,
    previewSteps, // Show what we'll do once we have the info
    missingFields: requiredMissing.map((m: any) => ({
      key: m.key,
      question: m.question,
      required: m.required !== false,
    })),
    goalDesc: goal.outcome,
    status: 'awaiting_input',
  });
  
  events.planReady(s, eventBus, safe([]), diff);
  
  return { 
    scratch: { ...s.scratch, plan: [], previewSteps }, 
    output: { ...s.output, diff } 
  };
}

function generatePreviewSteps(goal: any, missing: any[]): string[] {
  // Generate human-readable preview of what will happen
  const outcome = goal.outcome.toLowerCase();
  const steps: string[] = [];
  
  if (outcome.includes('triage') || outcome.includes('priority emails')) {
    steps.push(`1. Search your inbox for priority emails in the specified time window`);
    steps.push(`2. Filter and rank emails based on your criteria`);
    steps.push(`3. Select up to ${goal.provided?.max_results || 'N'} emails that need replies`);
  }
  
  if (outcome.includes('draft') || outcome.includes('reply')) {
    steps.push(`4. Generate quick-reply drafts for each selected email`);
    steps.push(`5. Present drafts for your review`);
  }
  
  // Add missing info note
  steps.push('');
  steps.push(`⏸️ Missing: ${missing.map((m: any) => m.key).join(', ')}`);
  
  return steps;
}
```

### 4. Better UI Response Format

The frontend should display:

```typescript
// Expected output.diff structure
{
  summary: "Need 2 more details to proceed",
  status: "awaiting_input",
  goalDesc: "Triage priority emails and create quick-reply drafts",
  previewSteps: [
    "1. Search your inbox for priority emails in the specified time window",
    "2. Filter and rank emails based on your criteria",
    "3. Select up to N emails that need replies",
    "4. Generate quick-reply drafts for each selected email",
    "5. Present drafts for your review",
    "",
    "⏸️ Missing: time_window_minutes, priority_criteria"
  ],
  missingFields: [
    {
      key: "time_window_minutes",
      question: "How many minutes back should I look for emails?",
      required: true,
      type: "number",
      placeholder: "10",
      defaultValue: 10
    },
    {
      key: "priority_criteria", 
      question: "What makes an email priority? (e.g., from specific senders, keywords, urgency)",
      required: false,
      type: "text",
      placeholder: "from:boss@company.com OR urgent OR ASAP"
    }
  ]
}
```

### 5. Suggested extractGoal Enhancement for Email Triage

Add specific pattern matching for common workflows:

```typescript
// In extractGoal.ts - buildGoalExtractionPrompt()

'**Common Workflow Patterns:**',
'',
'// Email Triage + Drafts',
'User: "Give me a 10-minute triage of priority emails and create quick-reply drafts (max 8)"',
'{',
'  "outcome": "Triage priority emails from the last 10 minutes and create up to 8 quick-reply drafts",',
'  "context": {',
'    "what": "priority emails needing replies",',
'    "when": "last 10 minutes",',
'    "constraints": ["max 8 drafts", "quick replies"]',
'  },',
'  "provided": {',
'    "time_window_minutes": 10,',
'    "max_results": 8,',
'    "action": "triage_and_draft"',
'  },',
'  "missing": [',
'    { "key": "priority_criteria", "question": "What makes an email priority? (keywords, senders, etc.)", "type": "text", "required": false },',
'    { "key": "reply_tone", "question": "Preferred tone for replies?", "type": "select", "options": ["professional", "casual", "friendly"], "required": false }',
'  ],',
'  "success_criteria": "Up to 8 draft replies created for priority emails from the last 10 minutes",',
'  "confidence": 0.9',
'}',
```

## Implementation Priority

1. **High Priority** (Immediate improvement):
   - ✅ Fix `extractGoal` to better detect missing fields for email triage
   - ✅ Update `confirm` to show structured questions instead of generic text
   - ✅ Add preview steps in planner when fields are missing

2. **Medium Priority** (Better UX):
   - Update frontend to display structured missing fields form
   - Add smart defaults for optional fields (10 minutes, professional tone, etc.)
   - Show preview plan even when awaiting input

3. **Low Priority** (Nice to have):
   - Machine learning to suggest priority criteria based on past behavior
   - Template library for common workflows
   - Auto-fill suggestions based on previous runs

## Expected Improved Response

After improvements:

```
**Restated Goal:**  
Triage priority emails from the last 10 minutes and create up to 8 quick-reply drafts.

---

**Preview Plan:**  
1. Search your inbox for emails received in the last 10 minutes
2. Filter emails based on priority criteria
3. Select up to 8 emails that need replies
4. Generate quick, context-appropriate reply drafts
5. Present drafts for your review

---

**I need a bit more information:**

📧 **Priority Criteria** (optional)  
What makes an email "priority" for you?  
Examples: from specific senders, contains keywords like "urgent", has attachments, etc.  
_If not specified, I'll use: unread emails from known contacts_

🎨 **Reply Tone** (optional)  
- [ ] Professional (default)
- [ ] Casual
- [ ] Friendly  

[Continue with defaults] or [Provide details]

---

_Once you provide these details (or continue with defaults), I'll proceed with the triage._
```

## Files to Update

1. `packages/agent/nodes/extractGoal.ts` - Better missing field detection
2. `packages/agent/nodes/confirm.ts` - Structured question handling  
3. `packages/agent/nodes/planner.ts` - Preview plan generation
4. `packages/agent/prompts/PLANNER_SYSTEM.ts` - Add workflow patterns
5. `apps/web/src/components/RunDisplay.tsx` (frontend) - Display structured missing fields

## Testing Scenarios

1. ✅ Email triage with time window but no criteria → Should ask for priority criteria
2. ✅ Calendar scheduling with attendee but no time → Should ask for when
3. ✅ Draft post with platform but no content → Should ask for content
4. ✅ Complete request with all fields → Should proceed immediately
5. ✅ Ambiguous request → Should show low confidence and ask clarifying questions
