import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToolBadge } from './ToolBadge';

export interface PlanData {
  intent: string;
  tools: string[];
  actions: string[];
  mode: 'plan';
}

interface PlanCardProps {
  data: PlanData;
  onConfirm?: () => void;
}

export const PlanCard = ({ data, onConfirm }: PlanCardProps) => {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 space-y-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground mb-1">Plan</h3>
            <p className="text-sm text-muted-foreground">{data.intent}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tools Required
            </p>
            <div className="flex flex-wrap gap-2">
              {data.tools.map((tool) => (
                <ToolBadge key={tool} tool={tool} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Actions
            </p>
            <ul className="space-y-1.5">
              {data.actions.map((action, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {onConfirm && (
        <div className="flex justify-end pt-2">
          <Button onClick={onConfirm} size="sm" className="gap-2">
            Confirm Run
          </Button>
        </div>
      )}
    </div>
  );
};
