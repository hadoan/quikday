/**
 * AppStore Integration Registry
 * 
 * This module exports the list of available integration slugs.
 * The API will dynamically import metadata and factories from each integration.
 * 
 * Convention: Each integration lives in packages/appstore/{slug}/
 * with metadata.ts and index.ts files.
 */

/**
 * List of all available integration slugs.
 * To add a new integration:
 * 1. Create packages/appstore/{slug}/ folder
 * 2. Add metadata.ts with AppMeta export
 * 3. Add index.ts with default factory export
 * 4. Add slug to this array
 */
export const INTEGRATION_SLUGS = [
  'linkedin-social',
  'gmail-email',
  'google-calendar',
] as const;

export type IntegrationSlug = (typeof INTEGRATION_SLUGS)[number];

/**
 * Get all registered integration slugs.
 */
export function getIntegrationSlugs(): readonly string[] {
  return INTEGRATION_SLUGS;
}

