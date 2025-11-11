import { Office365CalendarTokens } from './Office365CalendarTokens.js';

export interface Office365CalendarCallbackResult {
  /** OAuth tokens */
  tokens: Office365CalendarTokens;
  /** Raw response from token endpoint */
  raw?: any;
  /** Whether the token exchange was successful */
  success: boolean;
}
