/* NOTE: This file contains structure only. Implement provider logic separately. */
import type { AppMeta } from '@quikday/types/App';

export const metadata: AppMeta = {
  name: 'Google Calendar',
  title: 'Google Calendar',
  description:
    'Google Calendar helps you schedule, manage, and share events. Connect to create and update events directly from Quik.day.',
  installed: false,
  type: 'oauth2',
  variant: 'calendar',
  categories: ['productivity', 'calendar', 'google'],
  category: 'calendar',
  logo: '/logo/googlecalendar.svg',
  publisher: 'Google',
  slug: 'google-calendar',
  url: 'https://developers.google.com/calendar',
  email: 'support@example.com',
  dirName: 'google-calendar',
};
