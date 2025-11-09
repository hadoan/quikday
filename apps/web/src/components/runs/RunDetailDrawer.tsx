import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import InstallApp from '@/components/apps/InstallApp';
import { getAppInstallProps } from '@/lib/utils/appConfig';
import type { UiEvent, UiPlanStep, UiRunSummary } from '@/lib/datasources/DataSource';
import { getDataSource } from '@/lib/flags/featureFlags';
import { getAccessTokenProvider } from '@/apis/client';
import { formatDateTime, formatTime } from '@/lib/datetime/format';

interface Props {
  runId?: string;
  open: boolean;
  onClose: () => void;
}

export default function RunDetailDrawer({ runId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<UiRunSummary | null>(null);
  const [steps, setSteps] = useState<UiPlanStep[]>([]);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [parsed, setParsed] = useState<any | null>(null);

  useEffect(() => {
    if (!open || !runId) return;
    const ds = getDataSource();
    let socket: { close: () => void } | null = null;
    setLoading(true);
    (async () => {
      try {
        const { run, steps, events } = await ds.getRun(runId);
        setRun(run);
        setSteps(steps);
        setEvents(events);
      } catch (e) {
        console.error('Failed to load run', e);
      } finally {
        setLoading(false);
      }
      // Fetch backend run directly to access raw output (diff/commits/summary)
      try {
        const base = (import.meta as any)?.env?.VITE_API_BASE_URL || 'http://localhost:3000';
        const url = `${base}/runs/${runId}`;
        const headers = new Headers({ 'Content-Type': 'application/json' });
        try {
          const provider = getAccessTokenProvider();
          const tokOrPromise = provider?.();
          const token = tokOrPromise instanceof Promise ? await tokOrPromise : tokOrPromise;
          if (token) headers.set('Authorization', `Bearer ${token}`);
        } catch {}
        const res = await fetch(url, { headers });
        if (res.ok) {
          const raw = await res.json();
          const output = (raw && typeof raw === 'object') ? (raw as any).output : null;
          if (output && typeof output === 'object') {
            // Normalize to our expected structure (diff, commits, summary)
            const diff = (output as any).diff;
            const commits = Array.isArray((output as any).commits) ? (output as any).commits : [];
            const summary = (output as any).summary || (output as any).message || undefined;
            setParsed({ diff, commits, summary });
          }
        }
      } catch (e) {
        console.debug('Raw run fetch failed (non-fatal)', e);
      }
      try {
        socket = ds.connectRunStream(runId, (evt) => {
          setEvents((prev) => [...prev, evt]);
          if (evt.type === 'step_started' || evt.type === 'step_succeeded' || evt.type === 'step_failed') {
            // naive refresh
            void ds.getRun(runId).then((d) => setSteps(d.steps));
          }
          if (evt.type === 'run_completed' || evt.type === 'run_status') {
            setRun((prev) => (prev ? { ...prev, status: (evt.payload?.status as any) || prev.status } : prev));
          }
        });
      } catch (e) {
        console.warn('connectRunStream failed', e);
      }
    })();
    return () => {
      try { socket?.close(); } catch {}
    };
  }, [open, runId]);

  if (!open) return null;

  const safeStringify = (obj: unknown) => {
    try {
      const seen = new WeakSet();
      return JSON.stringify(
        obj,
        (key, value) => {
          if (key === '_raw') return '[omitted]';
          // Localize common datetime fields for readability
          if (
            (key === 'start' || key === 'end' || key.endsWith('At') || key.endsWith('_at')) &&
            typeof value === 'string'
          ) {
            const d = new Date(value);
            if (!Number.isNaN(d.valueOf())) {
              try { return formatDateTime(d); } catch {}
            }
          }
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value as object)) return '[Circular]';
            seen.add(value as object);
          }
          return value;
        },
        2,
      );
    } catch {
      return '[unserializable]';
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] md:w-[640px] bg-background border-l shadow-xl flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="text-sm text-muted-foreground">Run Detail</div>
            <div className="text-lg">{run?.prompt || run?.summaryText || runId}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="steps">Steps & Diff</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-muted-foreground">Status</div><div className="font-medium">{run?.status}</div></div>
                  <div><div className="text-muted-foreground">Created</div><div className="font-medium">{run?.createdAt ? formatDateTime(run.createdAt) : '—'}</div></div>
                  <div><div className="text-muted-foreground">Mode</div><div className="font-medium">{run?.mode || 'auto'}</div></div>
                  <div><div className="text-muted-foreground">ID</div><div className="font-mono text-xs">{runId}</div></div>
                </div>
                {parsed?.diff?.summary && (
                  <div className="text-sm">
                    <div className="text-muted-foreground">Plan Summary</div>
                    <div className="font-medium">{parsed.diff.summary}</div>
                  </div>
                )}
                {parsed?.summary && (
                  <div className="text-sm">
                    <div className="text-muted-foreground">Result</div>
                    <div className="font-medium whitespace-pre-wrap break-words">{parsed.summary}</div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="steps" className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-2">
                {steps.length === 0 && <div className="text-sm text-muted-foreground">No steps yet.</div>}
                {steps.map((s, i) => (
                  <div key={s.id || i} className="border rounded p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-medium">{s.tool}{s.action ? `.${s.action}` : ''}</div>
                      <div className="text-xs text-muted-foreground">{s.status}</div>
                    </div>
                    {s.appId && (
                      <div className="text-xs text-muted-foreground">
                        App: {s.appId}
                        {s.credentialId ? ` (Credential ID: ${s.credentialId})` : ''}
                      </div>
                    )}
                    {s.appId && (s.credentialId === null || s.credentialId === undefined) && (
                      <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded">
                        <div className="flex-1 text-xs text-amber-700 dark:text-amber-300">
                          ⚠️ Connect {s.appId} to continue
                        </div>
                        <div className="shrink-0">
                          <InstallApp {...getAppInstallProps(s.appId)} />
                        </div>
                      </div>
                    )}
                    {(s.errorMessage || s.errorCode) && (
                      <div className="text-xs text-destructive mt-1">{s.errorCode}: {s.errorMessage}</div>
                    )}
                  </div>
                ))}
                {Array.isArray(parsed?.diff?.steps) && parsed.diff.steps.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm text-muted-foreground mb-2">Planned Steps</div>
                    <div className="space-y-2">
                      {parsed.diff.steps.map((st: any) => (
                        <div key={st.id} className="border rounded p-2 text-sm">
                          <div className="font-medium">{st.tool}</div>
                          {Array.isArray(st.dependsOn) && st.dependsOn.length > 0 && (
                            <div className="text-xs text-muted-foreground">depends on: {st.dependsOn.join(', ')}</div>
                          )}
                        </div>
                      ))}
                  </div>
                  </div>
                )}
                {Array.isArray(parsed?.commits) && parsed.commits.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm text-muted-foreground mb-2">Step Results</div>
                    <div className="space-y-2">
                      {parsed.commits.map((c: any, idx: number) => {
                        const link = c?.result?.htmlLink as string | undefined;
                        return (
                          <div key={c.stepId || idx} className="border rounded p-2 text-sm">
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{c.stepId}</div>
                              {link && (
                                <a className="text-xs text-primary underline" href={link} target="_blank" rel="noreferrer">Open</a>
                              )}
                            </div>
                            <pre className="mt-1 whitespace-pre-wrap break-words text-xs">{safeStringify(c.result)}</pre>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="audit" className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-2">
                {events.length === 0 && <div className="text-sm text-muted-foreground">No events yet.</div>}
                {events.slice(-200).map((e, i) => (
                  <div key={`${e.ts}-${i}`} className="border rounded p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{e.type}</div>
                      <div className="text-muted-foreground">{formatTime(e.ts)}</div>
                    </div>
                    {e.payload && (
                      <pre className="mt-1 whitespace-pre-wrap break-words">{safeStringify(e.payload)}</pre>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
