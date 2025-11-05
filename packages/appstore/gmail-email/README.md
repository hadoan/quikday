# Gmail Integration - Add Flow

This module provides a library-style OAuth implementation for Gmail (send/read emails).

Usage mirrors the Google Calendar package. Key functions:

- `generateGmailAuthUrl(config)` — build OAuth URL
- `exchangeCode(config)` — exchange code for tokens
- `refreshToken(...)` — refresh access token using refresh_token
- `validateGmailTokens(tokens)` — basic token validation

See `add.ts` and `callback.ts` for implementation details and examples.
