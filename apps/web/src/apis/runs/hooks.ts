/**
 * React Query Hooks for Run API
 * Provides hooks for fetching and managing runs with caching and real-time updates
 */

import { useQuery } from '@tanstack/react-query';
import { getAccessTokenProvider } from '@/apis/client';
import type { RunsListResponse, RunsQueryParams } from './types';

/**
 * Hook for fetching paginated list of runs
 * Uses React Query for caching and automatic refetching
 */
export function useRunsQuery(params: RunsQueryParams) {
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
        console.error('[useRunsQuery] Fetch failed:', res.status, res.statusText);
        throw new Error(`Failed to fetch runs: ${res.status}`);
      }
      const data = (await res.json()) as RunsListResponse;
      return data;
    },
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });
}
