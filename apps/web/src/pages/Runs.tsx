import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import AppHeader from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { useRunsQuery } from '@/hooks/useRuns';
import { createRunListSocket } from '@/lib/ws/RunListSocket';
import { mockRuns } from '@/data/mockRuns';
import { useNavigate } from 'react-router-dom';
import RunDetailDrawer from '@/components/runs/RunDetailDrawer';
import { formatDateTime } from '@/lib/datetime/format';


export default function RunsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<'createdAt' | 'lastEventAt' | 'status' | 'stepCount'>(
    'createdAt',
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  const { data, refetch, isFetching } = useRunsQuery({
    page,
    pageSize,
    status,
    q,
    sortBy,
    sortDir,
  });

  useEffect(() => {
    const socket = createRunListSocket(() => {
      // Optimistically update row when projection arrives
      // Simple strategy: refetch if the run is in current page
      void refetch();
    });
    return () => socket.close();
  }, [refetch]);

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1),
    [data],
  );

  // Adapt API items to Sidebar list preview format
  const sidebarRuns = useMemo(() => {
    const items = data?.items ?? [];
    return items.slice(0, 30).map((r) => ({
      id: r.id,
      prompt: r.title,
      timestamp: r.createdAt,
      status:
        r.status === 'succeeded'
          ? ('completed' as const)
          : r.status === 'failed'
            ? ('failed' as const)
            : ('running' as const),
    }));
  }, [data]);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar
        runs={sidebarRuns.length ? sidebarRuns : mockRuns}
        activeRunId={activeRunId}
        onSelectRun={setActiveRunId as any}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AppHeader title="All Runs" onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
            {/* Filters */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 w-full md:w-96">
                <Input
                  placeholder="Search title or id..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setPage(1);
                      void refetch();
                    }
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Created</SelectItem>
                    <SelectItem value="lastEventAt">Last activity</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="stepCount">Step count</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(v) => setSortDir(v as any)}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Dir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">ASC</SelectItem>
                    <SelectItem value="desc">DESC</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Page Size" />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Title</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Steps</th>
                    <th className="text-left p-2">Created By</th>
                    <th className="text-left p-2">Created At</th>
                    <th className="text-left p-2">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && (!data || data.items.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {data && data.items.length === 0 && !isFetching && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No runs found. Try clearing filters.
                      </td>
                    </tr>
                  )}
                  {data?.items.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t hover:bg-accent/40 cursor-pointer"
                      onClick={() => setActiveRunId(r.id)}
                    >
                      <td className="p-2">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.kind} · {r.source}
                        </div>
                      </td>
                      <td className="p-2">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          {r.status}
                        </span>
                      </td>
                      <td className="p-2">{r.stepCount}</td>
                      <td className="p-2">{r.createdBy?.name || '—'}</td>
                      <td className="p-2">{formatDateTime(r.createdAt)}</td>
                      <td className="p-2">{formatDateTime(r.lastEventAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Page {page} of {totalPages} • {data?.total ?? 0} total
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RunDetailDrawer
        runId={activeRunId}
        open={!!activeRunId}
        onClose={() => setActiveRunId(undefined)}
      />
    </div>
  );
}
