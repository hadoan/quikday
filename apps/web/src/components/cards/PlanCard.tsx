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
  mode: 'preview' | 'auto';
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

  // Check if any steps are missing credentials
  const stepsNeedingInstall = (data.steps || []).filter(
    (step) => step.appId && (step.credentialId === null || step.credentialId === undefined)
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

          {/* Show steps that need credentials installed */}
          {hasMissingCredentials && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Apps Need Installation
                </p>
              </div>
              <div className="space-y-2">
                {stepsNeedingInstall.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center justify-between gap-3 p-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {step.tool}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Connect {step.appId} to continue
                      </div>
                    </div>
                    <div className="shrink-0">
                      <InstallApp
                        {...getAppInstallProps(step.appId!)}
                        onBeforeInstall={() => {
                          try {
                            if (runId) {
                              const payload = { runId, appId: step.appId, ts: Date.now() };
                              localStorage.setItem('qd.pendingInstall', JSON.stringify(payload));
                            }
                          } catch {
                            // ignore
                          }
                        }}
                        onInstalled={async () => {
                          try {
                            if (runId) {
                              await api.post(`/runs/${runId}/refresh-credentials`);
                              // no redirect needed for direct/input installs
                            }
                          } catch (e) {
                            console.warn('Failed to refresh credentials after install', e);
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {onConfirm && (
        <div className="border-t pt-4 mt-4 space-y-2">
          {hasMissingCredentials && (
            <div className="mb-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                ⚠️ Some apps need to be installed before this plan can be executed.
                Please install the required apps above.
              </p>
            </div>
          )}
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
