import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import type { UiRunData, UiRunStatus, UiStepStatus } from '@/lib/datasources/DataSource';

type CanonicalStatus = 'running' | 'success' | 'error';

interface RunCardProps {
  data: UiRunData;
}

function normalizeStatus(status?: UiRunData['status']): CanonicalStatus {
  const s = (status || '').toString().toLowerCase() as UiRunStatus | UiStepStatus | '';
  if (['error', 'failed', 'fail'].includes(s)) return 'error';
  if (['success', 'succeeded', 'completed', 'done'].includes(s)) return 'success';
  // Treat everything else (queued, planning, executing, running, partial) as running
  return 'running';
}

function formatTime(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString();
}

export const RunCard = ({ data }: RunCardProps) => {
  const status = normalizeStatus(data.status);
  const startedAt = (data.started_at as string | undefined) || (data as any).startedAt;
  const completedAt = (data.completed_at as string | undefined) || (data as any).completedAt;

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
            <p className="text-sm text-muted-foreground">
              {status === 'error' && (data as any).error
                ? (data as any).error
                : `Started at ${formatTime(startedAt)}`}
            </p>
          </div>

          {status === 'running' && data.progress !== undefined && (
            <div className="space-y-2">
              <Progress value={data.progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{data.progress}%</p>
            </div>
          )}

          {completedAt && (
            <p className="text-xs text-muted-foreground">
              Completed at {formatTime(completedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
