import { useMemo } from 'react';
import { useRunsQuery } from '@/hooks/useRuns';

export type SidebarRunItem = {
  id: string;
  prompt: string;
  timestamp: string;
  status: 'completed' | 'running' | 'failed';
};

function mapStatus(status: string): SidebarRunItem['status'] {
  const s = String(status || '').toLowerCase();
  if (s === 'succeeded' || s === 'completed' || s === 'done') return 'completed';
  if (s === 'failed') return 'failed';
  return 'running';
}

export function useSidebarRuns(limit = 5): { runs: SidebarRunItem[]; isLoading: boolean } {
  const { data, isLoading } = useRunsQuery({
    page: 1,
    pageSize: limit,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const runs = useMemo<SidebarRunItem[]>(() => {
    const items = data?.items ?? [];
    return items.map((r) => ({
      id: r.id,
      prompt: r.title,
      timestamp: r.createdAt,
      status: mapStatus(r.status),
    }));
  }, [data?.items]);

  return { runs, isLoading };
}
