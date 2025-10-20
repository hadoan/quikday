import { GoogleCalendarTokens } from './GoogleCalendarTokens.js';

export interface GoogleCalendarCallbackResult {
  /** Token data to store in database */
  tokens: GoogleCalendarTokens;
  /** Raw token response from Google */
  raw: any;
  /** Success indicator */
  success: boolean;
}
