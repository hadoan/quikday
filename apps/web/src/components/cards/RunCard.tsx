import * as React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { formatDateTime } from '@/lib/datetime/format';
import type { UiRunData, UiRunStatus, UiStepStatus } from '@/apis/runs';

type CanonicalStatus = 'running' | 'success' | 'error';

interface RunCardProps {
  data: UiRunData;
  runId?: string;
}

function normalizeStatus(status?: UiRunData['status']): CanonicalStatus {
  const s = (status || '').toString().toLowerCase() as UiRunStatus | UiStepStatus | '';
  if (['error', 'failed', 'fail'].includes(s)) return 'error';
  if (['success', 'succeeded', 'completed', 'done'].includes(s)) return 'success';
  // Treat everything else (queued, planning, executing, running, partial) as running
  return 'running';
}

function formatTimestamp(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return formatDateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toLocaleString();
  }
}

export const RunCard = ({ data }: RunCardProps) => {
  const rawStatus = String(data.status || '').toLowerCase();
  const status = normalizeStatus(data.status);
  const startedAt = data.started_at || undefined;
  const completedAt = data.completed_at || undefined;

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Running...';
      case 'success':
        return 'Completed';
      case 'error':
        return 'Failed';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'border-primary/20 bg-primary/5';
      case 'success':
        return 'border-success/20 bg-success/5';
      case 'error':
        return 'border-destructive/20 bg-destructive/5';
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border p-6 space-y-4 animate-fade-in',
        getStatusColor(),
        status === 'running' && 'animate-pulse-glow',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">{getStatusIcon()}</div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground mb-1">{getStatusText()}</h3>
            {status === 'error' && data.error ? (
              <p className="text-sm text-muted-foreground">{data.error}</p>
            ) : (
              <div className="grid gap-1 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <span className="text-muted-foreground/70 uppercase tracking-wide">Started</span>
                  <span className="font-medium text-foreground">{formatTimestamp(startedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <span className="text-muted-foreground/70 uppercase tracking-wide">
                    Completed
                  </span>
                  <span className="font-medium text-foreground">
                    {formatTimestamp(completedAt)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {status === 'running' && data.progress !== undefined && (
            <div className="space-y-2">
              <Progress value={data.progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{data.progress}%</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
