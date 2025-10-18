/* NOTE: This file contains structure only. Implement provider logic separately. */
import type { AppMeta } from '@runfast/types/App';

export const metadata: AppMeta = {
  name: 'LinkedIn Social',
  title: 'LinkedIn (Social)',
  description: 'Publish and manage posts to LinkedIn on behalf of a user or organization.',
  installed: false,
  type: 'oauth2',
  variant: 'social',
  categories: ['social', 'marketing'],
  category: 'social',
  logo: 'https://example.com/logos/linkedin.png',
  publisher: 'Quill Social',
  slug: 'linkedin-social',
  url: 'https://www.linkedin.com/developers/',
  email: 'support@example.com',
  dirName: 'linkedin-social',
};
