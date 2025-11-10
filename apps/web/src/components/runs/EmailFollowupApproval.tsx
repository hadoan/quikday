import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Mail, Clock, CheckCircle2, XCircle } from 'lucide-react';
import type { UiPlanStep } from '@/lib/datasources/DataSource';
import { getDataSource } from '@/lib/flags/featureFlags';

interface EmailFollowupApprovalProps {
  runId: string;
  steps: UiPlanStep[];
  onApproved?: () => void;
  onCancelled?: () => void;
}

export default function EmailFollowupApproval({
  runId,
  steps,
  onApproved,
  onCancelled,
}: EmailFollowupApprovalProps) {
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(
    new Set(steps.map((_, i) => i.toString())),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter steps that are email follow-ups (sendFollowup or generateFollowup)
  const emailSteps = steps.filter(
    (step) =>
      step.tool?.includes('followup') ||
      step.tool?.includes('email.send') ||
      step.action?.toLowerCase().includes('send'),
  );

  const toggleStep = (index: string) => {
    setSelectedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApprove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const ds = getDataSource();

      // Call the approval endpoint
      const approvedStepIds = Array.from(selectedSteps);
      await ds.approve(runId, approvedStepIds);

      onApproved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve run');
      console.error('Approval failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const ds = getDataSource();
      await ds.cancel(runId);
      onCancelled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel run');
      console.error('Cancel failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (emailSteps.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Review Follow-up Emails
            </CardTitle>
            <CardDescription>
              {emailSteps.length} email{emailSteps.length !== 1 ? 's' : ''} ready to send. Review
              and approve each one.
            </CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            60 min undo window
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="max-h-[500px] pr-4">
          <div className="space-y-4">
            {emailSteps.map((step, index) => {
              const stepIndex = steps.indexOf(step).toString();
              const isSelected = selectedSteps.has(stepIndex);
              const request = step.request as Record<string, unknown>;

              // Extract email details from request
              const subject = (request?.subject ||
                request?.originalSubject ||
                '(No Subject)') as string;
              const body = (request?.body || request?.preview || '') as string;
              const recipient = (request?.to || request?.recipient || 'Unknown') as string;

              return (
                <Card
                  key={stepIndex}
                  className={`transition-all ${
                    isSelected ? 'border-primary shadow-sm' : 'border-muted opacity-75'
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`step-${stepIndex}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleStep(stepIndex)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor={`step-${stepIndex}`}
                            className="font-medium cursor-pointer"
                          >
                            {subject}
                          </label>
                          {isSelected ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">To: {recipient}</p>
                        <div className="mt-2 p-3 bg-muted/50 rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{body}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <Button
            onClick={handleApprove}
            disabled={selectedSteps.size === 0 || submitting}
            className="flex-1"
          >
            {submitting ? 'Sending...' : `Send Selected (${selectedSteps.size})`}
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={submitting}>
            Cancel All
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-3 text-center">
          You can undo sent emails within 60 minutes from the run details page.
        </p>
      </CardContent>
    </Card>
  );
}
