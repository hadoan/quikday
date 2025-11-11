import { Activity, CheckCircle2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export interface LogEntry {
  tool: string;
  action: string;
  time: string;
  status?: 'success' | 'pending';
  output?: string; // optional short preview of step output
}

interface LogCardProps {
  logs: LogEntry[];
}

const formatOutput = (output: string): { formatted: string; isJson: boolean } => {
  try {
    const parsed = JSON.parse(output);
    return {
      formatted: JSON.stringify(parsed, null, 2),
      isJson: true,
    };
  } catch {
    return {
      formatted: output,
      isJson: false,
    };
  }
};

export const LogCard = ({ logs }: LogCardProps) => {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  const toggleExpand = (idx: number) => {
    setExpandedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Execution Log</h3>
      </div>

      <div className="space-y-2">
        {logs.map((log, idx) => {
          const { formatted, isJson } = log.output
            ? formatOutput(log.output)
            : { formatted: '', isJson: false };
          const isExpanded = expandedItems[idx] ?? false;
          // Hide output in Execution Log; outputs are shown via dedicated Output cards
          const hasOutput = false;

          return (
            <div
              key={idx}
              className="rounded-lg border border-border bg-muted/30 overflow-hidden transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start gap-3 p-3">
                <div className="mt-0.5 flex-shrink-0">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground text-sm">{log.tool}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {log.time}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground break-words">Completed {log.tool}</p>
                </div>
                {hasOutput && (
                  <button
                    onClick={() => toggleExpand(idx)}
                    className="flex-shrink-0 p-1 hover:bg-muted rounded transition-colors"
                    aria-label={isExpanded ? 'Collapse output' : 'Expand output'}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>

              {hasOutput && isExpanded && (
                <div className="border-t border-border bg-background/50 p-3">
                  <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Output
                  </div>
                  <pre
                    className={`text-[11px] leading-relaxed overflow-x-auto ${isJson ? 'text-foreground' : 'text-foreground/90'}`}
                  >
                    <code className="block whitespace-pre-wrap break-words">{formatted}</code>
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
