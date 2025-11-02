import { CheckCircle2, Sparkles, ThumbsUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToolBadge } from './ToolBadge';
import { useState } from 'react';

export interface PlanData {
  intent: string;
  tools: string[];
  actions: string[];
  mode: 'preview' | 'approval' | 'auto';
}

interface PlanCardProps {
  data: PlanData;
  onConfirm?: () => void;
  onReject?: () => void;
}

export const PlanCard = ({ data, onConfirm, onReject }: PlanCardProps) => {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApprove = async () => {
    if (!onConfirm) return;
    setIsApproving(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Approval failed:', error);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    setIsRejecting(true);
    try {
      await onReject();
    } catch (error) {
      console.error('Rejection failed:', error);
    } finally {
      setIsRejecting(false);
    }
  };

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
        <div className="border-t pt-4 mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              Review this plan before execution
            </p>
            <Badge variant="outline" className="text-xs">
              Awaiting Approval
            </Badge>
          </div>
          <div className="flex justify-end gap-2">
            {onReject && (
              <Button
                onClick={handleReject}
                disabled={isApproving || isRejecting}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <X className="h-4 w-4" />
                {isRejecting ? 'Rejecting...' : 'Reject'}
              </Button>
            )}
            <Button
              onClick={handleApprove}
              disabled={isApproving || isRejecting}
              size="sm"
              className="gap-2"
            >
              <ThumbsUp className="h-4 w-4" />
              {isApproving ? 'Approving...' : 'Approve & Execute'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
