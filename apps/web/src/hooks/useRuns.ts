import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccessTokenProvider } from '@/apis/client';

export type RunsListItem = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  createdBy: { id: number; name: string; avatar: string | null };
  kind: string;
  source: string;
  stepCount: number;
  approvals: { required: boolean };
  undo: { available: boolean };
  lastEventAt: string;
  tags?: string[];
};

export interface RunsListResponse {
  items: RunsListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export function useRunsQuery(params: {
  page: number;
  pageSize: number;
  status?: string[];
  q?: string;
  sortBy?: 'createdAt' | 'lastEventAt' | 'status' | 'stepCount';
  sortDir?: 'asc' | 'desc';
}) {
  const queryClient = useQueryClient();
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  if (params.q) qs.set('q', params.q);
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortDir) qs.set('sortDir', params.sortDir);
  (params.status ?? []).forEach((s) => qs.append('status', s));

  const url = `${import.meta.env.VITE_API_BASE_URL || ''}/runs?${qs.toString()}`;

  return useQuery<RunsListResponse>({
    queryKey: ['runs', params],
    queryFn: async () => {
      // Attach bearer token if available
      const headers = new Headers({ 'Content-Type': 'application/json' });
      try {
        const provider = getAccessTokenProvider();
        const tokenOrPromise = provider?.();
        const token = tokenOrPromise instanceof Promise ? await tokenOrPromise : tokenOrPromise;

        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      } catch (err) {
        // best-effort; proceed without token
      }
      const res = await fetch(url, { headers, credentials: 'include' });
      if (!res.ok) {
        console.error('[useRuns] Fetch failed:', res.status, res.statusText);
        throw new Error(`Failed to fetch runs: ${res.status}`);
      }
      const data = (await res.json()) as RunsListResponse;
      return data;
    },
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });
}
