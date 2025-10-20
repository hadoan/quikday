/* NOTE: This file contains structure only. Implement provider logic separately. */
import type { AppMeta } from '@quikday/types';

export const metadata: AppMeta = {
  name: 'Gmail',
  title: 'Gmail',
  description: 'Send and read emails using Gmail APIs with delegated access.',
  installed: false,
  type: 'oauth2',
  variant: 'email',
  categories: ['email', 'productivity'],
  category: 'email',
  logo: 'https://example.com/logos/gmail.png',
  publisher: 'Quill Social',
  slug: 'gmail',
  url: 'https://developers.google.com/gmail/api',
  email: 'support@example.com',
  dirName: 'gmail',
};
