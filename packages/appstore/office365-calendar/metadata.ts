import type { AppMeta } from '@quikday/types';

export const metadata: AppMeta = {
  name: 'Office 365 Calendar',
  title: 'Office 365 Calendar',
  description:
    'Office 365 Calendar (Microsoft 365) helps you schedule, manage, and share events with your organization. Connect to create and update events directly from Quik.day using your Microsoft account.',
  installed: false,
  type: 'oauth2',
  variant: 'automation',
  categories: ['productivity', 'calendar', 'microsoft', 'office365'],
  category: 'calendar',
  logo: '/logo/office365.svg',
  publisher: 'Microsoft',
  slug: 'office365-calendar',
  url: 'https://www.microsoft.com/microsoft-365',
  email: 'support@example.com',
  dirName: 'office365-calendar',
};
