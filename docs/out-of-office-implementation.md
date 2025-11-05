# Out-of-Office (Vacation Responder) Implementation

## Overview

Added support for setting Gmail vacation responder (out-of-office auto-reply) functionality to Quik.day. Users can now set automatic out-of-office replies with a simple prompt like:

```
Set an out-of-office from 2025-11-05 to 2025-11-06 with this message: "I am out of the office and will return on Nov 7"
```

## Implementation Details

### 1. Gmail Service Methods (`packages/appstore/gmail-email/gmail-email.service.ts`)

Added two new methods to `GmailEmailService`:

#### `setVacationResponder(startDate, endDate, message, subject?)`
- Sets vacation auto-reply using Gmail API
- Parameters:
  - `startDate`: Start time in epoch milliseconds
  - `endDate`: End time in epoch milliseconds
  - `message`: Auto-reply message (supports HTML)
  - `subject`: Optional subject line (defaults to "Out of Office")
- Uses `gmail.users.settings.updateVacation` API endpoint

#### `disableVacationResponder()`
- Disables the vacation responder
- Uses same API endpoint with `enableAutoReply: false`

### 2. OAuth Scopes (`packages/appstore/gmail-email/add.ts`)

Added required Gmail scope:
- `https://www.googleapis.com/auth/gmail.settings.basic` - Required for vacation responder configuration

**Note**: Existing users will need to reconnect their Gmail account to grant the new scope.

### 3. Agent Tool (`packages/agent/registry/tools/emails/setOutOfOffice.ts`)

Created new LangChain tool `email.setOutOfOffice`:

**Input Schema:**
```typescript
{
  startDate: string;     // YYYY-MM-DD format
  endDate: string;       // YYYY-MM-DD format
  message: string;       // Auto-reply message
  subject?: string;      // Optional subject (default: "Out of Office")
  timezone?: string;     // Optional timezone (default: America/New_York)
}
```

**Output Schema:**
```typescript
{
  ok: boolean;
  startDate: string;
  endDate: string;
  message: string;
  enabled: boolean;
}
```

**Features:**
- Validates date format (YYYY-MM-DD)
- Ensures end date is after start date
- Converts dates to epoch milliseconds for Gmail API
- Automatically covers the entire end date by setting time to 23:59:59

### 4. Tool Registration (`packages/agent/registry/registry.ts`)

Registered the new tool in the tool registry:
- Imported `emailSetOutOfOffice` function
- Registered with `moduleRef` for dependency injection

### 5. Prompt Updates

#### Email Domain Rules (`packages/agent/prompts/goal-extraction/domains/email-v1.ts`)
Added guidance for out-of-office operations:
```
- For out-of-office/vacation responder: requires start_date, end_date (YYYY-MM-DD format), and message
```

#### Planner System Prompt (`packages/agent/prompts/PLANNER_SYSTEM.ts`)
Added rule for out-of-office handling:
```
- "Set out-of-office" or "vacation responder" → use email.setOutOfOffice with startDate, endDate (YYYY-MM-DD), and message
```

#### Goal Extraction Examples (`packages/agent/prompts/goal-extraction/v1-examples.ts`)
Added example for out-of-office requests:
```typescript
// User: "Set an out-of-office from 2025-11-05 to 2025-11-06..."
{
  "outcome": "Set vacation responder (out-of-office auto-reply) from Nov 5 to Nov 6",
  "provided": {
    "start_date": "2025-11-05",
    "end_date": "2025-11-06",
    "message": "I am out of the office and will return on Nov 7"
  },
  "confidence": 0.95
}
```

## API Reference

### Gmail API Endpoint
```
PUT https://gmail.googleapis.com/gmail/v1/users/me/settings/vacation
```

### Request Body
```json
{
  "enableAutoReply": true,
  "responseSubject": "Out of Office",
  "responseBodyHtml": "<message>",
  "restrictToContacts": false,
  "restrictToDomain": false,
  "startTime": "1730764800000",
  "endTime": "1730937599000"
}
```

**Important**: Gmail replies to messages received before `endTime`. To cover all of the end date, set `endTime` to 23:59:59 of that day.

## Usage Examples

### Basic Out-of-Office
```
Set an out-of-office from 2025-11-05 to 2025-11-06 with message: "I am currently out of the office and will return on Nov 7"
```

### With Custom Subject
```
Set vacation responder from Dec 20 to Dec 27 with subject "Holiday Break" and message: "Thank you for your email. I am on holiday and will respond when I return."
```

### Disable Out-of-Office
```
Turn off my out-of-office auto-reply
```

## Technical Notes

1. **Date Handling**: 
   - Input dates are in YYYY-MM-DD format
   - Converted to epoch milliseconds for Gmail API
   - End time is set to 23:59:59 to cover the entire day

2. **Timezone Support**:
   - Default timezone: America/New_York
   - Can be customized via `timezone` parameter
   - Dates are interpreted in the specified timezone

3. **Message Format**:
   - Supports HTML content
   - Plain text is automatically converted to HTML
   - Gmail handles the formatting in auto-replies

4. **Scope Requirements**:
   - Requires `gmail.settings.basic` scope
   - Users need to reconnect Gmail if they connected before this feature

5. **Rate Limiting**:
   - Tool is rate-limited to 10 requests per minute
   - Risk level: low (reversible action)

## Testing

Build verified successfully:
```bash
pnpm --filter @quikday/agent build
✓ Build completed without errors
```

## Future Enhancements

1. **Disable Vacation Responder Tool**: Create `email.disableOutOfOffice` tool
2. **Get Vacation Settings**: Add `email.getOutOfOfficeSettings` to check current status
3. **Calendar Integration**: Automatically set OOO based on calendar events
4. **Templates**: Pre-defined message templates for common scenarios
5. **Contact/Domain Restrictions**: Add options to restrict auto-reply to contacts or domain

## References

- [Gmail API Vacation Settings](https://developers.google.com/gmail/api/reference/rest/v1/users.settings#VacationSettings)
- [Gmail Settings Basic Scope](https://developers.google.com/gmail/api/auth/scopes#gmail_scopes)
