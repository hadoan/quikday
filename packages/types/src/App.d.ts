export type AppVariant = 'social' | 'email' | 'crm' | 'automation' | 'other';
export interface AppMeta {
  name: string;
  description?: string;
  installed?: boolean;
  type: string;
  title: string;
  variant: AppVariant;
  categories: string[];
  category?: string;
  logo?: string;
  publisher?: string;
  slug: string;
  url?: string;
  email?: string;
  dirName: string;
}
//# sourceMappingURL=App.d.ts.map
