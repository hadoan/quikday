import { useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { UserMenu } from '@/components/layout/UserMenu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { useRunsQuery } from '@/hooks/useRuns';
import { createRunListSocket } from '@/lib/ws/RunListSocket';

const STATUS_OPTIONS = [
  'queued',
  'planning',
  'awaiting_approval',
  'approved',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'undo_pending',
  'undone',
  'undo_failed',
] as const;

export default function RunsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<'createdAt' | 'lastEventAt' | 'status' | 'stepCount'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data, refetch, isFetching } = useRunsQuery({ page, pageSize, status, q, sortBy, sortDir });

  useEffect(() => {
    const socket = createRunListSocket((payload) => {
      // Optimistically update row when projection arrives
      // Simple strategy: refetch if the run is in current page
      void refetch();
    });
    return () => socket.close();
  }, [refetch]);

  const totalPages = useMemo(() => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1), [data]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b p-4 flex items-center justify-between">
        <div className="font-semibold">All Runs</div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="w-64 border-r p-4 space-y-4 hidden md:block">
          <div>
            <div className="text-sm font-medium mb-2">Search</div>
            <Input placeholder="Search title or id..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setPage(1); }} />
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Status</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => {
                const active = status.includes(s);
                return (
                  <Button key={s} size="sm" variant={active ? 'default' : 'outline'} onClick={() => {
                    setPage(1);
                    setStatus((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
                  }}>{s}</Button>
                );
              })}
            </div>
          </div>
        </aside>
        <main className="flex-1 p-4">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="text-sm text-muted-foreground">{data ? data.total : 0} results</div>
            <div className="flex items-center gap-3">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Sort By" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Created</SelectItem>
                  <SelectItem value="lastEventAt">Last activity</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="stepCount">Step count</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as any)}>
                <SelectTrigger className="w-28"><SelectValue placeholder="Dir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">ASC</SelectItem>
                  <SelectItem value="desc">DESC</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue placeholder="Page Size" /></SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
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
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {data && data.items.length === 0 && !isFetching && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No runs found. Try clearing filters.</td></tr>
                )}
                {data?.items.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/40">
                    <td className="p-2">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.kind} · {r.source}</div>
                    </td>
                    <td className="p-2"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />{r.status}</span></td>
                    <td className="p-2">{r.stepCount}</td>
                    <td className="p-2">{r.createdBy?.name || '—'}</td>
                    <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="p-2">{new Date(r.lastEventAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

