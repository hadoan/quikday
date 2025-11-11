export interface Office365CalendarAuthUrlResult {
  /** OAuth authorization URL to redirect user to */
  url: string;
  /** Scopes being requested */
  scopes: string[];
}
