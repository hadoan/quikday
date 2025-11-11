import { ExchangeCalendarAuthConfig } from './ExchangeCalendarAuthConfig.js';

export interface ExchangeCalendarCallbackConfig extends ExchangeCalendarAuthConfig {
  /** User ID to associate with this credential */
  userId?: number;
}
