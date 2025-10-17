import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export type RunStatus = 'running' | 'success' | 'error';

export interface RunData {
  status: RunStatus;
  started_at: string;
  completed_at?: string;
  progress?: number;
  error?: string;
}

interface RunCardProps {
  data: RunData;
}

export const RunCard = ({ data }: RunCardProps) => {
  const getStatusIcon = () => {
    switch (data.status) {
      case 'running':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
    }
  };

  const getStatusText = () => {
    switch (data.status) {
      case 'running':
        return 'Running...';
      case 'success':
        return 'Completed';
      case 'error':
        return 'Failed';
    }
  };

  const getStatusColor = () => {
    switch (data.status) {
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
        data.status === 'running' && 'animate-pulse-glow',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">{getStatusIcon()}</div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground mb-1">{getStatusText()}</h3>
            <p className="text-sm text-muted-foreground">
              {data.status === 'error' && data.error
                ? data.error
                : `Started at ${new Date(data.started_at).toLocaleTimeString()}`}
            </p>
          </div>

          {data.status === 'running' && data.progress !== undefined && (
            <div className="space-y-2">
              <Progress value={data.progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{data.progress}%</p>
            </div>
          )}

          {data.completed_at && (
            <p className="text-xs text-muted-foreground">
              Completed at {new Date(data.completed_at).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
