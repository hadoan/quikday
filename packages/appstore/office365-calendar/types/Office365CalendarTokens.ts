export interface Office365CalendarTokens {
  /** Access token for API requests */
  access_token?: string | null;
  /** Refresh token for obtaining new access tokens */
  refresh_token?: string | null;
  /** Scope granted by user */
  scope?: string;
  /** Token type (usually 'Bearer') */
  token_type?: string | null;
  /** Expiry timestamp (Unix time in seconds) */
  expires_in?: number | null;
  /** User's email address */
  email?: string | null;
}
