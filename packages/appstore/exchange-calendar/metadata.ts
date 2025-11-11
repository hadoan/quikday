import type { AppMeta } from '@quikday/types';

export const metadata: AppMeta = {
  name: 'Exchange Calendar',
  title: 'Exchange Calendar',
  description:
    'Microsoft Exchange Calendar helps you schedule, manage, and share events with your organization. Connect to create and update events directly from Quik.day using your Exchange or Office 365 account.',
  installed: false,
  type: 'basic_auth',
  variant: 'automation',
  categories: ['productivity', 'calendar', 'microsoft', 'exchange'],
  category: 'calendar',
  logo: '/logo/exchange.svg',
  publisher: 'Microsoft',
  slug: 'exchange-calendar',
  url: 'https://docs.microsoft.com/exchange/',
  email: 'support@example.com',
  dirName: 'exchange-calendar',
};
