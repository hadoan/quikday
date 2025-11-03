import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Mail,
  Send,
  Calendar,
  MessageSquare,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UiPlanStep } from '@/lib/datasources/DataSource';
import { cn } from '@/lib/utils';

interface StepApprovalCardProps {
  step: UiPlanStep;
  stepNumber: number;
  isExpanded?: boolean;
  onToggle?: () => void;
}

/**
 * StepApprovalCard
 * 
 * Displays detailed information about a step that requires approval.
 * Shows action preview with relevant details (email subject/body, post content, etc.)
 * Follows best UX patterns:
 * - Expandable/collapsible to show details on demand
 * - Clear visual hierarchy with icons and badges
 * - Risk indicators for high-risk actions
 * - Preview of the actual content that will be sent/posted
 */
export const StepApprovalCard = ({
  step,
  stepNumber,
  isExpanded: controlledExpanded,
  onToggle,
}: StepApprovalCardProps) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  // Extract meaningful data from step.request
  const requestData = (step.request as Record<string, unknown>) || {};
  const action = step.action || step.tool;

  // Get icon based on tool type
  const getStepIcon = () => {
    const tool = step.tool.toLowerCase();
    if (tool.includes('email') || tool.includes('gmail')) return Mail;
    if (tool.includes('calendar')) return Calendar;
    if (tool.includes('slack') || tool.includes('message')) return MessageSquare;
    if (tool.includes('linkedin') || tool.includes('social') || tool.includes('post')) return Send;
    if (tool.includes('notion') || tool.includes('docs')) return FileText;
    return FileText;
  };

  const Icon = getStepIcon();

  // Extract key details based on tool type
  const getStepDetails = () => {
    const details: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[] = [];

    // Helper to safely convert unknown to string
    const toString = (val: unknown): string => {
      if (typeof val === 'string') return val;
      if (typeof val === 'number') return String(val);
      if (val === null || val === undefined) return '';
      return JSON.stringify(val);
    };

    // Email-specific
    if (requestData.to || requestData.recipient || requestData.recipients) {
      const recipients = Array.isArray(requestData.recipients)
        ? requestData.recipients.map(toString).join(', ')
        : toString(requestData.to || requestData.recipient);
      details.push({ label: 'To', value: recipients, icon: User });
    }

    if (requestData.subject) {
      details.push({ label: 'Subject', value: toString(requestData.subject), icon: Mail });
    }

    if (requestData.body || requestData.content || requestData.text || requestData.message) {
      const content = requestData.body || requestData.content || requestData.text || requestData.message;
      details.push({ label: 'Content', value: toString(content) });
    }

    // Calendar-specific
    if (requestData.summary || requestData.title) {
      details.push({ label: 'Event', value: toString(requestData.summary || requestData.title), icon: Calendar });
    }

    if (requestData.startTime || requestData.start) {
      details.push({ label: 'Start', value: toString(requestData.startTime || requestData.start), icon: Clock });
    }

    if (requestData.attendees) {
      const attendees = Array.isArray(requestData.attendees)
        ? requestData.attendees.map((a: unknown) => {
            if (typeof a === 'object' && a !== null && 'email' in a) {
              return (a as { email: string }).email;
            }
            return String(a);
          }).join(', ')
        : toString(requestData.attendees);
      details.push({ label: 'Attendees', value: attendees, icon: Users });
    }

    // Social/Messaging
    if (requestData.channel) {
      details.push({ label: 'Channel', value: toString(requestData.channel) });
    }

    if (requestData.platform) {
      details.push({ label: 'Platform', value: toString(requestData.platform) });
    }

    return details;
  };

  const details = getStepDetails();
  const hasDetails = details.length > 0;

  // Determine risk level (from tool metadata or step)
  const stepWithRisk = step as UiPlanStep & { risk?: string };
  const isHighRisk = stepWithRisk.risk === 'high' || action?.toLowerCase().includes('send');

  return (
    <Card className={cn(
      'transition-all duration-200',
      isHighRisk ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10' : 'border-border'
    )}>
      <CardContent className="p-4">
        <button
          onClick={handleToggle}
          className="w-full flex items-start gap-3 text-left group"
        >
          {/* Expand/Collapse Icon */}
          <div className="mt-0.5 shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </div>

          {/* Step Icon */}
          <div className={cn(
            'mt-0.5 shrink-0 p-2 rounded-lg',
            isHighRisk 
              ? 'bg-amber-100 dark:bg-amber-900/30' 
              : 'bg-primary/10'
          )}>
            <Icon className={cn(
              'h-4 w-4',
              isHighRisk ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
            )} />
          </div>

          {/* Step Summary */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">
                Step {stepNumber}
              </span>
              {isHighRisk && (
                <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  Requires Approval
                </Badge>
              )}
            </div>
            <div className="font-medium text-sm text-foreground mb-1">
              {action}
            </div>
            {!isExpanded && hasDetails && (
              <div className="text-xs text-muted-foreground truncate">
                {details[0]?.value}
              </div>
            )}
          </div>

          {/* Status Indicator */}
          <div className="mt-1 shrink-0">
            {step.status === 'succeeded' || step.status === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Expanded Details */}
        {isExpanded && hasDetails && (
          <div className="mt-4 ml-10 space-y-3 animate-in fade-in-50 duration-200">
            {details.map((detail, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  {detail.icon && (
                    <detail.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {detail.label}
                  </span>
                </div>
                <div className={cn(
                  'text-sm text-foreground p-3 rounded-lg border',
                  detail.label === 'Content' 
                    ? 'bg-muted/30 whitespace-pre-wrap max-h-48 overflow-y-auto' 
                    : 'bg-muted/30'
                )}>
                  {detail.value}
                </div>
              </div>
            ))}

            {/* Show app/credential info if available */}
            {step.appId && (
              <div className="pt-2 border-t space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  App
                </span>
                <div className="text-sm text-foreground">
                  {step.appId}
                  {step.credentialId && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (ID: {step.credentialId})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show message if no details available */}
        {isExpanded && !hasDetails && (
          <div className="mt-4 ml-10 text-sm text-muted-foreground italic">
            No additional details available for preview
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StepApprovalCard;
