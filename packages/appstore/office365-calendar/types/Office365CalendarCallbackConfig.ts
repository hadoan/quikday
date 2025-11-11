import { Office365CalendarAuthConfig } from './Office365CalendarAuthConfig.js';

export interface Office365CalendarCallbackConfig extends Office365CalendarAuthConfig {
  /** OAuth authorization code from callback */
  code: string;
}
