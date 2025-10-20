# Google Calendar Integration - Add Flow

This module provides a **library-style** OAuth implementation (no Next.js dependencies) for Google Calendar integration.

## Usage

### In your API (NestJS, Express, etc.)

```typescript
import { generateGoogleCalendarAuthUrl } from '@quikday/appstore/google-calendar/add';

// In your controller/route handler:
async getGoogleCalendarAuthUrl(userId: string, teamId?: string) {
  // Fetch your app's Google OAuth credentials
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.WEBAPP_URL}/api/integrations/google-calendar/callback`;

  // Encode state for CSRF protection and session tracking
  const state = encodeOAuthState({ userId, teamId, timestamp: Date.now() });

  // Generate OAuth URL
  const { url, scopes } = generateGoogleCalendarAuthUrl({
    clientId,
    clientSecret,
    redirectUri,
    state,
  });

  // Return URL to frontend or redirect user
  return { url, scopes };
}
```

### Function API

#### `generateGoogleCalendarAuthUrl(config)`

Generates Google Calendar OAuth authorization URL.

**Parameters:**
- `config.clientId` (string, required) - Google OAuth2 client ID
- `config.clientSecret` (string, required) - Google OAuth2 client secret
- `config.redirectUri` (string, required) - Callback URL where Google sends auth code
- `config.state` (string, optional) - CSRF token/session data (recommended)

**Returns:**
```typescript
{
  url: string;        // OAuth URL to redirect user to
  scopes: string[];   // Requested scopes
}
```

**Throws:**
- Error if `clientId`, `clientSecret`, or `redirectUri` are missing

### OAuth Scopes

The integration requests these scopes:
- `https://www.googleapis.com/auth/calendar.readonly` - Read calendar events
- `https://www.googleapis.com/auth/calendar.events` - Create, update, delete events

### Example: NestJS Controller

```typescript
import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { generateGoogleCalendarAuthUrl } from '@quikday/appstore/google-calendar/add';
import { AuthGuard } from '../auth/auth.guard';

@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  @Get('add')
  @UseGuards(AuthGuard)
  async initiateOAuth(@Req() req) {
    const userId = req.user.sub;
    
    const { url } = generateGoogleCalendarAuthUrl({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: `${process.env.WEBAPP_URL}/api/integrations/google-calendar/callback`,
      state: JSON.stringify({ userId }), // Or use a secure state encoder
    });

    return { url };
  }
}
```

## Callback Handler

After user authorizes, Google redirects to your callback URL with an authorization code. Exchange it for tokens:

### `exchangeGoogleCalendarCode(config)`

```typescript
import { exchangeGoogleCalendarCode } from '@quikday/appstore/google-calendar/callback';

// In your callback route handler:
const result = await exchangeGoogleCalendarCode({
  code: authCode, // From query params
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: `${process.env.WEBAPP_URL}/api/integrations/google-calendar/callback`,
});

// Store tokens (ENCRYPT before storing!)
await prisma.credential.create({
  data: {
    type: 'google-calendar',
    key: encryptTokens(result.tokens), // Use @quikday/crypto
    userId: user.id,
    appId: 'google-calendar',
  },
});
```

### Token Refresh

Use `refreshGoogleCalendarToken()` to get new access tokens when they expire:

```typescript
import { 
  refreshGoogleCalendarToken, 
  isTokenExpired 
} from '@quikday/appstore/google-calendar/callback';

// Check if token needs refresh
if (isTokenExpired(storedTokens)) {
  const refreshed = await refreshGoogleCalendarToken({
    refreshToken: storedTokens.refresh_token!,
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  });

  // Update stored credential
  await prisma.credential.update({
    where: { id: credentialId },
    data: { key: encryptTokens(refreshed.tokens) },
  });
}
```

### Helper Functions

- `validateGoogleCalendarTokens(tokens)` - Check if tokens are valid
- `isTokenExpired(tokens, bufferMs?)` - Check if access token needs refresh
- `refreshGoogleCalendarToken(config)` - Refresh expired access token

## Next Steps

1. ✅ **Callback handler implemented** (`callback.ts`)
2. **Store tokens securely** using `@quikday/crypto` (AES-GCM encryption)
3. **Create tool** (`index.ts`) with `create_calendar_event` LangChain tool
4. **Register in app registry** (`_appRegistry.ts`)
5. **Add Zod schemas** for event validation in `@quikday/types`

## Dependencies

- `googleapis` (v144+) - Google APIs client library
- Node.js 18+ recommended
