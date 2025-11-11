import { CheckCircle2, Sparkles, ThumbsUp, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToolBadge } from './ToolBadge';
import InstallApp from '@/components/apps/InstallApp';
import { getAppInstallProps } from '@/lib/utils/appConfig';
import { useState } from 'react';
import type { UiPlanStep } from '@/lib/datasources/DataSource';
import api from '@/apis/client';

export interface PlanData {
  intent: string;
  tools: string[];
  actions: string[];
  mode: 'preview' | 'approval' | 'auto';
  steps?: UiPlanStep[];
}

interface PlanCardProps {
  data: PlanData;
  onConfirm?: () => void;
  onReject?: () => void;
  runId?: string;
}

export const PlanCard = ({ data, onConfirm, onReject, runId }: PlanCardProps) => {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  console.log(data.steps)

  // Check if any steps are missing credentials
  const stepsNeedingInstall = (data.steps || []).filter(
    (step) => step.appId && (step.credentialId === null || step.credentialId === undefined),
  );
  const hasMissingCredentials = stepsNeedingInstall.length > 0;

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
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-6 space-y-3 sm:space-y-4 animate-fade-in">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="mt-1">
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-2 sm:space-y-3 min-w-0">
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-foreground mb-1">Plan</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">{data.intent}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tools Required
            </p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
                <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary mt-0.5 shrink-0" />
                  <span className="break-words">{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Planned steps detail (if provided) */}
          {data.steps && data.steps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Planned Steps
              </p>
              <ol className="space-y-1.5 list-decimal list-inside">
                {data.steps.map((step) => (
                  <li key={step.id} className="text-sm">
                    <span className="font-medium">{step.tool}</span>
                    {step.action && <span className="text-muted-foreground"> — {step.action}</span>}
                    {step.inputsPreview && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {step.inputsPreview}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

         
        </div>
      </div>

      {onConfirm && (
        <div className="border-t pt-4 mt-4 space-y-2">
          {hasMissingCredentials && (
            <div className="mb-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                ⚠️ Some apps need to be installed before this plan can be executed. Please install
                the required apps above.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Review this plan before execution</p>
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
              disabled={isApproving || isRejecting || hasMissingCredentials}
              size="sm"
              className="gap-2"
              title={hasMissingCredentials ? 'Install required apps first' : undefined}
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
