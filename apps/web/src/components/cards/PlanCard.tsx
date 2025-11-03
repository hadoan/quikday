import { CheckCircle2, Sparkles, ThumbsUp, X, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToolBadge } from './ToolBadge';
import InstallApp from '@/components/apps/InstallApp';
import { getAppInstallProps } from '@/lib/utils/appConfig';
import { useState } from 'react';
import type { UiPlanStep } from '@/lib/datasources/DataSource';
import api from '@/apis/client';
import { StepApprovalCard } from './StepApprovalCard';

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
  const [showAllSteps, setShowAllSteps] = useState(false);

  // Check if any steps are missing credentials
  const stepsNeedingInstall = (data.steps || []).filter(
    (step) => step.appId && (step.credentialId === null || step.credentialId === undefined)
  );
  const hasMissingCredentials = stepsNeedingInstall.length > 0;

  // Filter steps that need approval (high risk or explicitly marked)
  const stepsNeedingApproval = (data.steps || []).filter((step) => {
    const stepWithRisk = step as UiPlanStep & { risk?: string; waitingConfirm?: boolean };
    return stepWithRisk.waitingConfirm === true || stepWithRisk.risk === 'high';
  });
  const hasApprovalSteps = stepsNeedingApproval.length > 0;

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

          {/* Show step approval cards for high-risk steps */}
          {hasApprovalSteps && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Steps Requiring Approval ({stepsNeedingApproval.length})
                  </p>
                </div>
                {stepsNeedingApproval.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllSteps(!showAllSteps)}
                    className="h-auto py-1 text-xs gap-1"
                  >
                    {showAllSteps ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Show All
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {(showAllSteps ? stepsNeedingApproval : stepsNeedingApproval.slice(0, 3)).map(
                  (step, idx) => (
                    <StepApprovalCard
                      key={step.id}
                      step={step}
                      stepNumber={data.steps?.indexOf(step) ?? idx + 1}
                    />
                  )
                )}
              </div>
              {!showAllSteps && stepsNeedingApproval.length > 3 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  + {stepsNeedingApproval.length - 3} more steps
                </p>
              )}
            </div>
          )}

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
        <div className="border-t pt-4 mt-4 space-y-3">
          {hasMissingCredentials && (
            <div className="mb-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                ⚠️ Some apps need to be installed before this plan can be executed.
                Please install the required apps above.
              </p>
            </div>
          )}
          
          {/* Approval Summary */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <p className="text-sm font-semibold text-foreground">
                    Approval Required
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasApprovalSteps ? (
                    <>
                      This plan contains <strong>{stepsNeedingApproval.length}</strong> high-risk {stepsNeedingApproval.length === 1 ? 'action' : 'actions'} that require your explicit approval.
                      Review the details above before proceeding.
                    </>
                  ) : (
                    'Review this plan carefully before execution.'
                  )}
                </p>
                
                {/* Quick summary of what will happen */}
                {hasApprovalSteps && (
                  <ul className="text-xs text-muted-foreground space-y-1 ml-7">
                    {stepsNeedingApproval.slice(0, 3).map((step, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-amber-500">•</span>
                        <span>{step.action || step.tool}</span>
                      </li>
                    ))}
                    {stepsNeedingApproval.length > 3 && (
                      <li className="text-muted-foreground/70">
                        ...and {stepsNeedingApproval.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                Awaiting Approval
              </Badge>
            </div>
          </div>

          {/* Action Buttons */}
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
