# No-Reply Sweep Feature Implementation

## Overview

The No-Reply Sweep feature allows users to automatically find email threads they sent that haven't received replies, generate polite follow-up drafts, review them, and send them with a 60-minute undo window.

## User Flow

1. **User types prompt**: `"No-Reply Sweep last 7 days"`
2. **Graph classifies intent**: Detects email follow-up workflow
3. **Planner generates plan**: Creates multi-step plan with preview
4. **Mode handling**:
   - **PREVIEW**: Shows plan with draft previews, stops
   - **APPROVAL**: Shows plan, waits for user approval
   - **AUTO**: Executes immediately (not recommended for emails)
5. **User reviews drafts**: Frontend shows EmailFollowupApproval component
6. **User approves**: Selects which emails to send
7. **Executor sends emails**: Sends approved drafts
8. **Undo window**: 60 minutes to undo sent emails

## Architecture

### Backend Components

#### 1. Agent Tools (packages/agent/registry/tools/emails/)

**searchNoReply.ts**
- Tool: `email.searchNoReply`
- Searches sent emails in last N days with no replies
- Returns: thread metadata (subject, recipient, snippet)

**generateFollowup.ts**
- Tool: `email.generateFollowup`  
- Uses LLM to generate contextual follow-up drafts
- Inputs: threadId, originalSubject, originalSnippet, recipient, tone
- Returns: subject, body, preview

**sendFollowup.ts**
- Tool: `email.sendFollowup`
- Sends follow-up email in existing thread
- Creates EmailAction record for undo capability
- Implements undo() method to delete/trash sent email

#### 2. Database Schema (packages/prisma/src/schema.prisma)

```prisma
model EmailAction {
  id             Int       @id @default(autoincrement())
  userId         String
  runId          String
  messageId      String
  threadId       String
  action         String    // 'SENT', 'UNDONE'
  canUndo        Boolean   @default(true)
  undoExpiresAt  DateTime?
  undoneAt       DateTime?
  createdAt      DateTime  @default(now())

  @@index([messageId])
  @@index([userId])
  @@index([runId])
  @@index([undoExpiresAt])
}
```

#### 3. API Endpoints (apps/api/src/)

**POST /runs/:id/approve** (already exists)
- Approves selected steps in a run
- Located in: `runs/runs.controller.ts`
- Body: `{ approvedSteps: string[] }`

**DELETE /email/undo/:messageId** (newly created)
- Undoes a sent email within 60-minute window
- Located in: `email/email.controller.ts`
- Checks EmailAction table for eligibility
- Moves email to trash via Gmail API

### Frontend Components

#### EmailFollowupApproval.tsx (apps/web/src/components/runs/)

**Features:**
- Displays email drafts with subject, recipient, and body
- Checkbox selection for each draft
- Shows selected count and undo window badge
- Approve button sends selected emails
- Cancel button cancels entire run
- Error handling and loading states

**Usage:**
```tsx
import EmailFollowupApproval from '@/components/runs/EmailFollowupApproval';

<EmailFollowupApproval
  runId={run.id}
  steps={run.steps}
  onApproved={() => console.log('Approved!')}
  onCancelled={() => console.log('Cancelled')}
/>
```

## Example Workflow

### Step 1: User Prompt
```
User: "No-Reply Sweep last 7 days"
```

### Step 2: Planner Creates Plan
```json
{
  "plan": [
    {
      "step": 1,
      "tool": "email.searchNoReply",
      "input": { "daysAgo": 7, "maxResults": 20 },
      "reasoning": "Find unreplied email threads from last 7 days"
    },
    {
      "step": 2,
      "tool": "email.generateFollowup",
      "input": {
        "threadId": "thread-123",
        "originalSubject": "Product Demo Follow-up",
        "originalSnippet": "Hi John, following up on...",
        "recipient": "john@example.com",
        "tone": "polite"
      },
      "reasoning": "Generate follow-up draft for thread 1"
    },
    {
      "step": 3,
      "tool": "email.sendFollowup",
      "input": {
        "threadId": "thread-123",
        "subject": "Re: Product Demo Follow-up",
        "body": "Hi John,\n\nI wanted to follow up...",
        "to": "john@example.com"
      },
      "reasoning": "Send approved follow-up"
    }
  ]
}
```

### Step 3: Mode Check (in buildMainGraph.ts)
```typescript
.addEdge('planner', (s) => {
  // APPROVAL mode: Show plan and halt for user approval
  if (s.mode === 'APPROVAL' && hasExecutableSteps) {
    (s.scratch as any).requiresApproval = true;
    return 'END'; // Halt graph here, wait for approval
  }
  
  // AUTO mode: Continue to execution immediately
  if (s.mode === 'AUTO') {
    return 'confirm';
  }
  
  return 'confirm';
})
```

### Step 4: Frontend Renders Approval UI
The frontend detects `requiresApproval: true` and renders `EmailFollowupApproval` component.

### Step 5: User Approves
```http
POST /runs/:runId/approve
{
  "approvedSteps": ["1", "2"]
}
```

### Step 6: Backend Re-queues Run
The run is re-queued with filtered plan containing only approved steps.

### Step 7: Executor Sends Emails
Each `email.sendFollowup` tool call:
1. Sends email via Gmail API
2. Creates EmailAction record with 60-min expiry
3. Returns messageId and undoExpiresAt

### Step 8: Undo (Optional)
```http
DELETE /email/undo/:messageId
```
- Checks if within 60-minute window
- Moves email to trash
- Marks EmailAction as undone

## Configuration

### Environment Variables
No additional environment variables needed. Uses existing:
- `DATABASE_URL` - PostgreSQL connection
- Gmail OAuth credentials (already configured)

### Tool Registration (packages/agent/registry/registry.ts)
```typescript
import {
  emailSearchNoReply,
  emailGenerateFollowup,
  emailSendFollowup,
} from './tools/email.js';

export function registerToolsWithLLM(llm: LLM, moduleRef: ModuleRef) {
  // ... existing tools
  registry.register(emailSearchNoReply(moduleRef));
  registry.register(emailGenerateFollowup(moduleRef, llm));
  registry.register(emailSendFollowup(moduleRef));
}
```

## Testing

### Manual Test Flow
1. Start dev servers: `pnpm dev`
2. Connect Gmail account via integrations page
3. Send test emails and wait (or backdate for testing)
4. Type in chat: "No-Reply Sweep last 7 days"
5. Verify plan shows unreplied threads
6. Review generated follow-up drafts
7. Select drafts to send
8. Click "Send Selected"
9. Verify emails sent
10. Test undo within 60 minutes

### Unit Tests
```typescript
// Test email.searchNoReply tool
describe('emailSearchNoReply', () => {
  it('should find unreplied threads', async () => {
    const result = await tool.call({ daysAgo: 7, maxResults: 10 }, ctx);
    expect(result.threads.length).toBeGreaterThan(0);
  });
});

// Test email.generateFollowup tool
describe('emailGenerateFollowup', () => {
  it('should generate follow-up draft', async () => {
    const result = await tool.call({
      threadId: 'thread-123',
      originalSubject: 'Test',
      originalSnippet: 'Hello',
      recipient: 'test@example.com',
      tone: 'polite'
    }, ctx);
    expect(result.body).toBeTruthy();
  });
});
```

## Best Practices

1. **Always use APPROVAL mode** for email sends (never AUTO by default)
2. **Provide clear previews** in the UI before sending
3. **Respect rate limits** - Gmail API has quotas
4. **Handle errors gracefully** - network issues, API failures, etc.
5. **Log all email actions** for audit trail
6. **Test undo thoroughly** - critical safety feature
7. **Validate email addresses** before sending
8. **Use appropriate tone** - professional, polite, not pushy

## Future Enhancements

- [ ] Schedule follow-up nudges (e.g., +3 days if still no reply)
- [ ] Customizable follow-up templates
- [ ] A/B testing different follow-up tones
- [ ] Analytics on reply rates
- [ ] Batch undo (undo entire run)
- [ ] Snooze instead of send
- [ ] Thread priority scoring

## Troubleshooting

### Emails not found
- Check Gmail OAuth scopes include `gmail.readonly` and `gmail.send`
- Verify user has sent emails in the specified timeframe
- Check search query filters

### Follow-ups not generated
- Verify LLM service is configured and accessible
- Check LLM token limits and quotas
- Review LLM prompt and adjust if needed

### Emails not sending
- Verify Gmail OAuth access token is valid
- Check network connectivity to Gmail API
- Review rate limiting and quotas

### Undo not working
- Verify within 60-minute window
- Check EmailAction record exists in database
- Ensure Gmail API deleteMessage permission

## License
GNU Affero General Public License v3.0 (AGPL-3.0)

---

© 2025 Quik.day. Built with ❤️ by Ha Doan and contributors.
