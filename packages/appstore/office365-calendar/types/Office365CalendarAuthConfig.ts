export interface Office365CalendarAuthConfig {
  /** Microsoft OAuth2 client ID */
  clientId: string;
  /** Microsoft OAuth2 client secret */
  clientSecret: string;
  /** Redirect URI where Microsoft will send the auth code */
  redirectUri: string;
  /** Optional state parameter for CSRF protection and session tracking */
  state?: string;
}
