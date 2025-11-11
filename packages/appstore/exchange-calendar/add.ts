import type { AppMeta } from '@quikday/types';
import { ExchangeCalendarAuthUrlResult } from './types/ExchangeCalendarAuthUrlResult.js';

/**
 * Generate the setup URL for Exchange Calendar.
 * Unlike OAuth2 providers, Exchange uses basic authentication with a setup form.
 *
 * @returns Object containing the setup URL
 */
export function generateExchangeCalendarAuthUrl(): ExchangeCalendarAuthUrlResult {
  return {
    url: '/apps/exchange-calendar/setup',
  };
}

/**
 * Resolve the Exchange Calendar setup URL.
 * This function is called by the API route handler.
 *
 * @param params - Request parameters including meta and base URL info
 * @returns Object containing the setup URL
 */
export async function resolveExchangeCalendarAuthUrl(params: {
  req: any;
  meta: AppMeta;
}): Promise<ExchangeCalendarAuthUrlResult> {
  const { req, meta } = params;

  // For Exchange Calendar, we redirect to a setup form instead of OAuth
  const baseUrl = process.env.WEBAPP_URL || process.env.WEBAPP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const setupUrl = `${baseUrl.replace(/\/$/, '')}/apps/${meta.slug}/setup`;

  return {
    url: setupUrl,
  };
}
