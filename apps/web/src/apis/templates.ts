import api from './client';

export type Template = {
  id: string;
  kind: string;
  label: string;
  sample_text: string;
  icon?: string;
  category?: string;
  variables?: Array<{ key: string; type: string; required?: boolean }>;
  locale: 'en' | 'de';
  is_default?: boolean;
  is_user_custom?: boolean;
};

export async function listTemplates(locale: 'en' | 'de' = 'en'): Promise<Template[]> {
  const res = await api.get<Template[]>(`/templates`, { params: { locale } });
  return res.data;
}

export async function createTemplate(
  data: Omit<Template, 'id' | 'is_default' | 'is_user_custom'> & { is_user_custom?: boolean },
  { requireConfirm = true }: { requireConfirm?: boolean } = {},
): Promise<Template> {
  // Add explicit confirm flag for safety
  const res = await api.post<Template>(`/templates`, { ...data, confirm: !!requireConfirm });
  return res.data;
}
