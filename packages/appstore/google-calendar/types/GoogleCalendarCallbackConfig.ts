export interface GoogleCalendarCallbackConfig {
  /** Authorization code from Google OAuth redirect */
  code: string;
  /** Google OAuth2 client ID */
  clientId: string;
  /** Google OAuth2 client secret */
  clientSecret: string;
  /** Redirect URI (must match the one used in auth URL) */
  redirectUri: string;
}
