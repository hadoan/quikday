# Step Approval UI/UX Improvement

## Overview
Enhanced the approval flow to show users detailed information about what actions will be executed before they approve high-risk steps. This provides transparency and confidence in the automation system.

## What Changed

### 1. New Component: `StepApprovalCard`
**Location**: `apps/web/src/components/cards/StepApprovalCard.tsx`

**Features**:
- **Expandable/Collapsible**: Each step can be expanded to show full details
- **Contextual Icons**: Different icons for different action types (email, calendar, messaging, social, docs)
- **Risk Indicators**: Visual amber/warning styling for high-risk actions
- **Smart Data Extraction**: Automatically extracts and displays relevant fields based on tool type:
  - **Email**: To, Subject, Body/Content
  - **Calendar**: Event title, Start time, Attendees
  - **Messaging**: Channel, Content/Message
  - **Social**: Platform, Content/Text
- **Credential Info**: Shows which app and credential will be used
- **Status Indicators**: Shows completion status with icons

**Best UX Patterns**:
- Card-based design with clear visual hierarchy
- Smooth animations on expand/collapse
- Color-coded risk levels (amber for high-risk)
- Truncated preview in collapsed state
- Full scrollable content in expanded state
- Accessible button patterns with proper ARIA labels

### 2. Enhanced `PlanCard` Component
**Location**: `apps/web/src/components/cards/PlanCard.tsx`

**New Features**:
- **Step Details Section**: Shows all steps that require approval with expandable cards
- **Smart Filtering**: Automatically identifies high-risk steps based on `waitingConfirm` flag or `risk: 'high'`
- **Progressive Disclosure**: Shows first 3 steps by default, with "Show All" button for more
- **Enhanced Approval Summary**: Clear box showing:
  - Number of high-risk actions
  - Quick bullet list of what will be executed
  - Contextual messaging based on content
- **Improved Button States**: Clear disabled states when credentials are missing
- **Better Visual Hierarchy**: Uses cards, badges, and icons to guide user attention

### 3. Backend Integration
**No changes needed** - The existing backend already stores step arguments in the `request` field:
- `apps/api/src/runs/steps.service.ts` - `createPlannedSteps()` stores `p.args` as `request`
- `packages/agent/nodes/planner.ts` - Planner generates steps with args
- Step model includes `waitingConfirm` boolean flag (already exists in schema)

## User Experience Flow

1. **User submits a high-risk prompt** (e.g., "Send email to team about project update")
2. **Planner generates plan** with steps marked as `waitingConfirm: true`
3. **UI displays PlanCard** with:
   - Summary of the plan intent
   - Tools required badges
   - Actions list
   - **NEW**: "Steps Requiring Approval" section with expandable cards
   - **NEW**: Enhanced approval summary box with details
4. **User reviews step details** by expanding cards to see:
   - Email recipient(s)
   - Email subject
   - Full email body
   - Which account will send it
5. **User approves or rejects** with confidence knowing exactly what will happen

## Example Use Cases

### Email Sending
When user says: "Send email to sara@example.com with subject 'Meeting Tomorrow' and body 'Let's meet at 10am'"

The approval card shows:
```
Step 1: gmail_send_email
├─ To: sara@example.com
├─ Subject: Meeting Tomorrow
└─ Content: Let's meet at 10am
```

### Calendar Event
When user says: "Schedule meeting with John tomorrow at 2pm"

The approval card shows:
```
Step 1: google_calendar_create_event
├─ Event: Meeting with John
├─ Start: 2024-11-04T14:00:00
└─ Attendees: john@example.com
```

### LinkedIn Post
When user says: "Post to LinkedIn about our new feature launch"

The approval card shows:
```
Step 1: linkedin_create_post
├─ Platform: LinkedIn
└─ Content: [full post content]
```

## Design Decisions

### Why Expandable Cards?
- Reduces cognitive load by hiding details until needed
- Allows users to quickly scan which steps need approval
- Provides deep transparency when user wants to verify details

### Why Amber/Warning Colors for High-Risk?
- Draws attention without being alarming (not red)
- Consistent with warning/caution UX patterns
- Makes it clear these actions need careful review

### Why Show First 3 Steps?
- Balances detail with brevity
- Most common use cases have 1-3 high-risk steps
- "Show All" option available for power users

### Why Include Credential Info?
- Users want to know which account will be used
- Helps prevent sending from wrong account
- Supports multi-profile workflows

## Technical Implementation

### Type Safety
- Proper TypeScript types throughout
- Safe type guards for unknown data
- No `any` types in component logic

### Performance
- Lazy rendering of step details (only when expanded)
- Memoized computations where appropriate
- Efficient re-rendering with proper React patterns

### Accessibility
- Proper button semantics
- ARIA labels where needed
- Keyboard navigation support
- Color contrast meets WCAG standards

## Future Enhancements

1. **Diff Preview**: Show before/after for edit operations
2. **Credential Switching**: Allow changing which account to use before approval
3. **Batch Approval**: Approve multiple runs at once
4. **Approval Templates**: Save approval decisions for similar patterns
5. **Audit Log Link**: Jump to audit log from approval card
6. **Risk Scoring**: Show calculated risk score per step
7. **Undo Preview**: Show what undo would do if approved

## Testing Notes

To test this feature:
1. Start the dev server: `pnpm dev`
2. Create a run with high-risk tools (e.g., email send, LinkedIn post)
3. Verify that:
   - Steps section appears with correct count
   - Cards are expandable/collapsible
   - Details show correctly based on tool type
   - Approval summary is clear and accurate
   - Buttons work correctly
   - Missing credentials are handled gracefully

## Related Files

- `apps/web/src/components/cards/StepApprovalCard.tsx` - New component
- `apps/web/src/components/cards/PlanCard.tsx` - Enhanced component
- `packages/prisma/src/schema.prisma` - Step model (already has `waitingConfirm`)
- `apps/api/src/runs/steps.service.ts` - Step creation logic (no changes needed)
- `packages/agent/nodes/executor.ts` - Approval halt logic (no changes needed)

---

**Status**: ✅ Complete and ready for testing

**Impact**: High - Significantly improves user confidence and transparency in approval flow
