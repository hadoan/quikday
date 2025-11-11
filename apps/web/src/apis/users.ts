import api from './client';

export type UpdateMeRequest = {
  name?: string;
  avatar?: string;
};

export type UpdateMeResponse = {
  id: number;
  email?: string;
  name?: string;
  avatar?: string;
  timeZone?: string;
  plan: 'FREE' | 'PRO';
  createdAt: string;
  lastLoginAt?: string;
};

export async function updateMe(payload: UpdateMeRequest): Promise<UpdateMeResponse> {
  const { data } = await api.patch<UpdateMeResponse>('/users/me', payload);
  return data;
}

export async function fetchUserMe(): Promise<UpdateMeResponse> {
  const { data } = await api.get<UpdateMeResponse>('/users/me');
  return data;
}
