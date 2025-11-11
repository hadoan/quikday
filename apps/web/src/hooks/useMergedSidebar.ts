import { useMemo } from 'react';
import type { UiRunSummary } from '@/lib/datasources/DataSource';

interface SidebarRun {
  id: string;
  prompt: string;
  timestamp: string;
  status: 'completed' | 'failed' | 'running';
}

/**
 * Merges server-provided sidebar runs with local draft/unknown runs
 * so that new chats appear in sidebar as soon as user starts typing
 */
export function useMergedSidebar(
  runs: UiRunSummary[],
  sidebarRuns: SidebarRun[] | undefined,
): SidebarRun[] {
  return useMemo(() => {
    try {
      const server = sidebarRuns || [];
      const serverIds = new Set(server.map((r) => r.id));
      const localExtras = runs
        .filter((r) => !serverIds.has(r.id))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
        .map((r) => ({
          id: r.id,
          prompt: r.prompt || '',
          timestamp: r.timestamp || new Date().toISOString(),
          status:
            r.status === 'succeeded' || r.status === 'completed' || r.status === 'done'
              ? ('completed' as const)
              : r.status === 'failed'
                ? ('failed' as const)
                : ('running' as const),
        }));

      // Prepend local extras, then server items; de-duplicate by id
      const combined: SidebarRun[] = [];
      const seen = new Set<string>();
      for (const item of [...localExtras, ...server]) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        combined.push(item);
      }
      return combined;
    } catch {
      return sidebarRuns || [];
    }
  }, [runs, sidebarRuns]);
}
