import { ExchangeCalendarCredentials } from './ExchangeCalendarCredentials.js';

export interface ExchangeCalendarCallbackResult {
  /** Encrypted credentials */
  credentials: ExchangeCalendarCredentials;
  /** Whether the connection test was successful */
  success: boolean;
  /** Optional error message if connection test failed */
  error?: string;
}
