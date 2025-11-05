import type { InstallAppProps } from '@/components/apps/InstallApp';

/**
 * App configuration mapping for install props.
 * This should ideally be fetched from the backend, but for now we hardcode the most common apps.
 */
const APP_CONFIGS: Record<string, Omit<InstallAppProps, 'type' | 'slug'>> = {
  'google-calendar': {
    variant: 'calendar',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'gmail-email': {
    variant: 'email',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'slack-messaging': {
    variant: 'messaging',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'notion-productivity': {
    variant: 'docs',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'hubspot-crm': {
    variant: 'crm',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'close-crm': {
    variant: 'crm',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'linkedin-social': {
    variant: 'social',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'jira-devtools': {
    variant: 'devtools',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'github-devtools': {
    variant: 'devtools',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
  'googlesheets-data': {
    variant: 'data',
    allowedMultipleInstalls: false,
    installMethod: 'oauth',
  },
};

/**
 * Get install props for a given appId.
 * Returns default props if app is not configured.
 */
export function getAppInstallProps(appId: string): InstallAppProps {
  const config = APP_CONFIGS[appId] || {
    variant: 'other',
    allowedMultipleInstalls: false,
    installMethod: 'oauth' as const,
  };

  return {
    type: appId,
    slug: appId,
    ...config,
  };
}
