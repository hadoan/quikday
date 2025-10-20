export interface GoogleCalendarAuthConfig {
  /** Google OAuth2 client ID */
  clientId: string;
  /** Google OAuth2 client secret */
  clientSecret: string;
  /** Redirect URI where Google will send the auth code */
  redirectUri: string;
  /** Optional state parameter for CSRF protection and session tracking */
  state?: string;
}
