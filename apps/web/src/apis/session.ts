import api from './client';

export type MeResponse = {
  id: number;
  email?: string | null;
  name?: string;
  authSub: string;
  workspaceId?: number;
  workspaceSlug?: string;
  plan: 'FREE' | 'PRO';
};

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/auth/me');
  return data;
}
