import * as React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import type { UiRunData, UiRunStatus, UiStepStatus } from '@/lib/datasources/DataSource';
import { getDataSource } from '@/lib/flags/featureFlags';

type CanonicalStatus = 'running' | 'success' | 'error';

interface RunCardProps {
  data: UiRunData;
  // Optional runId so the card's awaiting-input form can submit answers
  runId?: string;
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

export const RunCard = ({ data, runId }: RunCardProps) => {
  const rawStatus = String((data as any).status || '').toLowerCase();
  const status = normalizeStatus(data.status);
  const awaitingQuestions =
    (data as any).awaitingQuestions || (data as any).awaiting?.questions || [];
  const approvalSteps = (data as any).approvalSteps || [];

  // Debug logging
  console.log('🎯 RunCard render:', {
    rawStatus,
    hasRunId: !!runId,
    approvalStepsCount: approvalSteps.length,
    approvalSteps: approvalSteps,
  });

  const dataSource = getDataSource();
  const dsAny = dataSource as unknown as { applyAnswers?: Function; confirm?: Function; approve?: Function; cancel?: Function };
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [approving, setApproving] = React.useState(false);

  React.useEffect(() => {
    const seed: Record<string, string> = {};
    for (const q of awaitingQuestions) seed[q.key] = (answers[q.key] ?? '') as string;
    setAnswers(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingQuestions?.map?.((q: any) => q.key).join('|')]);

  const onChange = (k: string, v: string) => setAnswers((prev) => ({ ...prev, [k]: v }));

  const handleApprove = async () => {
    if (!runId || approving) return;
    setApproving(true);
    try {
      const stepIds = approvalSteps.map((s: any) => s.id).filter(Boolean);
      if (typeof dsAny.approve === 'function') {
        await dsAny.approve(runId, stepIds);
      }
    } catch (e) {
      console.error('Approval failed', e);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!runId || approving) return;
    setApproving(true);
    try {
      if (typeof dsAny.cancel === 'function') {
        await dsAny.cancel(runId);
      }
    } catch (e) {
      console.error('Rejection failed', e);
    } finally {
      setApproving(false);
    }
  };

  const onSubmit = async () => {
    if (!runId) {
      alert('Run ID unavailable for submitting answers');
      return;
    }
    setSubmitting(true);
    try {
      if (dsAny.applyAnswers && typeof dsAny.applyAnswers === 'function') {
        await dsAny.applyAnswers(runId, answers);
      } else {
        // Fallback to native fetch
        await fetch(`/runs/${runId}/answers`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers }),
        }).then((r) => {
          if (!r.ok) throw new Error('applyAnswers failed');
        });
      }

      if (dsAny.confirm && typeof dsAny.confirm === 'function') {
        await dsAny.confirm(runId);
      } else {
        await fetch(`/runs/${runId}/confirm`, { method: 'POST' }).then((r) => {
          if (!r.ok) throw new Error('confirm failed');
        });
      }
    } catch (e) {
      console.error('Submit failed', e);
      alert('Could not submit answers. Please check values and try again.');
    } finally {
      setSubmitting(false);
    }
  };
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

  // If run is awaiting input, render the input form inline (per UX copy)
  if (rawStatus === 'awaiting_input' || (awaitingQuestions && awaitingQuestions.length > 0)) {
    const qs = awaitingQuestions as any[];

    return (
      <div className="card border rounded-xl p-4 bg-card">
        <h3 className="font-semibold text-lg">I need a couple details to proceed</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Please fill these in. I’ll continue automatically once you submit.
        </p>

        <div className="space-y-3">
          {qs.map((q) => (
            <div key={q.key} className="flex flex-col">
              <label className="text-sm font-medium">{q.question}</label>
              {q.rationale && <span className="text-xs text-gray-500 mb-1">{q.rationale}</span>}

              {q.options?.length ? (
                <select
                  value={answers[q.key] ?? ''}
                  onChange={(e) => onChange(q.key, e.target.value)}
                  className="border rounded px-2 py-1"
                >
                  <option value="" disabled>
                    Select an option…
                  </option>
                  {q.options.map((opt: string) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g., 2025-10-24T10:00:00Z"
                  value={answers[q.key] ?? ''}
                  onChange={(e) => onChange(q.key, e.target.value)}
                  className="border rounded px-2 py-1"
                />
              )}
            </div>
          ))}
        </div>

        {/* <div className="mt-4 flex gap-2">
          <button
            onClick={onSubmit}
            disabled={submitting || qs.some((q) => !(answers[q.key] ?? '').trim())}
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit & Continue'}
          </button>
        </div> */}
      </div>
    );
  }

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

          {/* Display approval steps when awaiting approval */}
          {rawStatus === 'awaiting_approval' && approvalSteps.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Steps Awaiting Approval:</h4>
              {approvalSteps.map((step: any, idx: number) => (
                <div key={idx} className="p-3 border rounded-lg bg-background/50">
                  <div className="font-mono text-xs text-muted-foreground mb-1">{step.tool}</div>
                  {step.args && (
                    <pre className="text-xs overflow-auto max-h-32 bg-muted/30 p-2 rounded">
                      {JSON.stringify(step.args, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2">
                Review the actions above and approve to proceed.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  onClick={handleApprove}
                  disabled={approving}
                  size="sm"
                  className="flex-1"
                >
                  {approving ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={approving}
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                >
                  Reject
                </Button>
              </div>
            </div>
          )}

          {completedAt && (
            <p className="text-xs text-muted-foreground">Completed at {formatTime(completedAt)}</p>
          )}
        </div>
      </div>
    </div>
  );
};
