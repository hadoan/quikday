import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import InstallApp from '@/components/apps/InstallApp';
import { getAppInstallProps } from '@/lib/utils/appConfig';
import { getWebBaseUrl } from '@/apis/client';

export type StepInfo = {
  id: string;
  tool: string;
  appId?: string;
  credentialId?: number | null;
  action?: string;
};

export interface MissingCredentialsProps {
  runId: string;
  steps: StepInfo[];
  onBeforeInstall?: (appId: string) => void;
  onInstalled?: (appId: string) => void;
}

/**
 * MissingCredentials component displays steps that require app installation.
 * Shows a warning banner with install buttons for each app that needs credentials.
 */
export function MissingCredentials({
  runId,
  steps,
  onBeforeInstall,
  onInstalled,
}: MissingCredentialsProps) {
  // Filter steps that need credentials installed
  const stepsNeedingInstall = React.useMemo(() => {
    if (!Array.isArray(steps)) {
      console.log('[MissingCredentials] No steps array provided:', steps);
      return [];
    }
    console.log('[MissingCredentials] Checking steps for missing credentials:', steps);
    const missing = steps.filter(
      (step) => step.appId && (step.credentialId === null || step.credentialId === undefined),
    );
    console.log('[MissingCredentials] Steps needing install:', missing);
    return missing;
  }, [steps]);

  const hasMissingCredentials = stepsNeedingInstall.length > 0;

  React.useEffect(() => {
    console.log('[MissingCredentials] State update:', {
      stepsCount: steps?.length || 0,
      stepsNeedingInstallCount: stepsNeedingInstall.length,
      hasMissingCredentials,
    });
  }, [steps, stepsNeedingInstall, hasMissingCredentials]);

  if (!hasMissingCredentials) {
    return null;
  }

  return (
    <div className="space-y-2 pt-2 border-t mt-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
          Required Apps
        </p>
      </div>
      <div className="space-y-3">
        {stepsNeedingInstall.map((step, index) => (
          <div
            key={step.id}
            className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Step {index + 1}: {step.tool}
                </div>
                {step.action && <div className="text-sm text-foreground mt-1">{step.action}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  Connect {step.appId} to continue
                </div>
              </div>
              <div className="shrink-0">
                <InstallApp
                  {...getAppInstallProps(step.appId!)}
                  returnTo={`${getWebBaseUrl()}/chat}`}
                  runId={runId}
                  onBeforeInstall={() => {
                    try {
                      if (runId) {
                        const payload = {
                          runId,
                          appId: step.appId,
                          pendingCredential: step.appId,
                          ts: Date.now(),
                        };
                      }
                      onBeforeInstall?.(step.appId!);
                    } catch (e) {
                      // ignore
                    }
                  }}
                  onInstalled={() => {
                    console.log('[MissingCredentials] App installed, OAuth will redirect to clean chat');
                    onInstalled?.(step.appId!);
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MissingCredentials;
