import { Activity, CheckCircle2, Clock } from 'lucide-react';

export interface LogEntry {
  tool: string;
  action: string;
  time: string;
  status?: 'success' | 'pending';
}

interface LogCardProps {
  logs: LogEntry[];
}

export const LogCard = ({ logs }: LogCardProps) => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Execution Log</h3>
      </div>

      <div className="space-y-3">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 font-mono text-sm"
          >
            <div className="mt-0.5">
              {log.status === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <Clock className="h-4 w-4 text-warning" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{log.tool}</span>
                <span className="text-xs text-muted-foreground">{log.time}</span>
              </div>
              <p className="text-muted-foreground break-all">{log.action}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
