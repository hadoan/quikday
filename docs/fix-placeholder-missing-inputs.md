# Fix: Missing Inputs Detection for Placeholder Syntax

## Problem

When users provided prompts with placeholder syntax like:

```
Set an out-of-office from {start=date} to {end=date} with this message: {msg=text}.
```

The system was attempting to execute the tool with invalid date values (literally "date" instead of actual dates), causing validation errors:

```
"error": "Invalid date format. Use YYYY-MM-DD format."
```

## Root Cause

The goal extraction system was treating type placeholders (`{start=date}`, `{msg=text}`) the same as concrete values (`{minutes=10}`), passing them through as "provided" values instead of recognizing them as missing inputs.

## Solution

Updated three key prompt files to properly distinguish between:

- **Concrete values**: `{minutes=10}` → extract as provided value
- **Type placeholders**: `{start=date}` → recognize as missing, don't extract

### Changes Made

#### 1. Goal Extraction Format Rules (`v1-format-rules.ts`)

Added explicit guidance to NOT extract type placeholders:

```typescript
'- When the value is a TYPE PLACEHOLDER (e.g., {start=date}, {end=date}, {msg=text}), DO NOT extract it as a provided value',
'- Type placeholders indicate MISSING information that needs to be collected from the user',
'- Only extract concrete values: {minutes=10} ✓  {start=date} ✗  {msg=text} ✗',
```

#### 2. Goal Extraction Examples (`v1-examples.ts`)

Added example showing placeholder handling:

```typescript
// User: "Set an out-of-office from {start=date} to {end=date} with this message: {msg=text}."
{
  "outcome": "Set vacation responder (out-of-office auto-reply) for specified date range",
  "provided": {},  // Empty - placeholders are NOT extracted
  "confidence": 0.85
}
```

#### 3. Missing Inputs System Prompt (`MISSING_INPUTS_SYSTEM.ts`)

Enhanced validation rules for date fields:

```typescript
'**Date field handling:**',
'- startDate/endDate fields that are null, empty, or contain non-date values like "date" → mark as missing',
'- Ask for dates in user-friendly format: "What is the start date? (e.g., 2025-11-05 or 'tomorrow')"',
'- Message/text fields that are null, empty, or contain placeholder values like "text" → mark as missing'
```

## Expected Behavior After Fix

### Input

```
Set an out-of-office from {start=date} to {end=date} with this message: {msg=text}.
```

### Expected Flow

1. **Goal Extraction** → Recognizes placeholders, returns empty `provided: {}`
2. **Planner** → Creates plan with `email.setOutOfOffice` tool but null/empty args
3. **Missing Inputs Detection** → Identifies 3 missing required fields:
   - `startDate`: "What is the start date? (e.g., 2025-11-05)"
   - `endDate`: "What is the end date? (e.g., 2025-11-06)"
   - `message`: "What message would you like to use for your out-of-office reply?"
4. **User provides values** → System executes with valid dates
5. **Success** → Vacation responder enabled ✓

## Testing

Build verified:

```bash
pnpm --filter @quikday/agent build
✓ No errors
```

## Related Files

- `packages/agent/prompts/goal-extraction/v1-format-rules.ts`
- `packages/agent/prompts/goal-extraction/v1-examples.ts`
- `packages/agent/prompts/MISSING_INPUTS_SYSTEM.ts`

## Type Placeholders Reference

Common placeholder patterns that should trigger missing input detection:

| Placeholder    | Type   | Example                               |
| -------------- | ------ | ------------------------------------- |
| `{key=date}`   | Date   | `{start=date}`, `{end=date}`          |
| `{key=text}`   | Text   | `{msg=text}`, `{subject=text}`        |
| `{key=email}`  | Email  | `{to=email}`, `{from=email}`          |
| `{key=number}` | Number | `{count=number}`, `{duration=number}` |

Concrete values that SHOULD be extracted:

| Syntax               | Value Extracted         |
| -------------------- | ----------------------- |
| `{minutes=10}`       | `10` (number)           |
| `{max=8}`            | `8` (number)            |
| `{start=2025-11-05}` | `"2025-11-05"` (string) |
| `{msg="Hello"}`      | `"Hello"` (string)      |
