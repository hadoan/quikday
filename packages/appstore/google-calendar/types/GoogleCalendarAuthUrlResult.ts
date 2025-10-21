export interface GoogleCalendarAuthUrlResult {
  /** OAuth authorization URL to redirect user to */
  url: string;
  /** Scopes requested */
  scopes: string[];
}
