export interface GoogleCalendarTokens {
  /** Access token for API requests */
  access_token?: string | null;
  /** Refresh token for obtaining new access tokens */
  refresh_token?: string | null;
  /** Scope granted by user */
  scope?: string;
  /** Token type (usually 'Bearer') */
  token_type?: string | null;
  /** Expiry timestamp (Unix time in milliseconds) */
  expiry_date?: number | null;
  /** ID token (JWT with user info) */
  id_token?: string | null;
}
