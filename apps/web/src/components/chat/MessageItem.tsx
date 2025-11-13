import React, { useState } from 'react';
import { ChatMessage } from './ChatMessage';
import MarkdownView from '@/components/common/MarkdownView';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { PlanCard } from '@/components/cards/PlanCard';
import { RunCard } from '@/components/cards/RunCard';
import { LogCard } from '@/components/cards/LogCard';
import { OutputCard } from '@/components/cards/OutputCard';
import { ParamsCard } from '@/components/cards/ParamsCard';
import { UndoCard } from '@/components/cards/UndoCard';
import QuestionsPanel from '@/components/chat/QuestionsPanel';
import MissingCredentials from '@/components/chat/MissingCredentials';
import { useToast } from '@/hooks/use-toast';
import { getDataSource } from '@/lib/flags/featureFlags';
import type {
  UiRunSummary,
  UiPlanData,
  UiPlanStep,
  UiRunData,
  UiLogData,
  UiOutputData,
  UiParamsData,
  UiUndoData,
  UiQuestionsData,
  UiQuestionItem,
  UiAppCredentialsData,
  UiMessage,
} from '@/apis/runs';

interface MessageItemProps {
  message: UiMessage;
  runId?: string;
}

const MessageItem: React.FC<MessageItemProps> = ({ message: m, runId }) => {
  const { toast } = useToast();
  if (!m) return null;

  if (m.role === 'user') {
    return (
      <ChatMessage role="user">
        <p className="text-sm">{m.content}</p>
      </ChatMessage>
    );
  }

  // Assistant messages: render structured types with corresponding cards
  if (m.type === 'plan') {
    return <PlanMessage data={m.data as UiPlanData} runId={runId} toast={toast} />;
  }

  if (m.type === 'run') {
    const rd = (m.data as UiRunData) || ({} as UiRunData);
    const st = String(rd?.status || '').toLowerCase();
    const isTerminal = ['succeeded', 'failed', 'completed', 'done', 'partial'].includes(st);
    if (isTerminal) return null;
    return (
      <ChatMessage role="assistant">
        <RunCard data={rd} runId={runId} />
      </ChatMessage>
    );
  }

  if (m.type === 'log') {
    // LogCard logic omitted for brevity
    return (
      <ChatMessage role="assistant">
        <></>
      </ChatMessage>
    );
  }

  if (m.type === 'app_credentials') {
    const acd = (m.data as UiAppCredentialsData) || ({ steps: [] } as UiAppCredentialsData);
    const steps = Array.isArray(acd?.steps) ? acd.steps : [];

    // Convert UiPlanStep[] to StepInfo[] (subset of fields needed by MissingCredentials)
    const stepInfos = steps.map((s) => ({
      id: s.id,
      tool: s.tool,
      appId: s.appId,
      credentialId: s.credentialId,
      action: s.action,
    }));

    return (
      <ChatMessage role="assistant">
        <MissingCredentials
          runId={acd?.runId || runId || ''}
          steps={stepInfos}
          onBeforeInstall={(appId) => {
            console.log('[MessageItem] Starting install for app:', appId);
          }}
          onInstalled={(appId) => {
            console.log('[MessageItem] App installed:', appId);
          }}
        />
      </ChatMessage>
    );
  }

  if (m.type === 'questions') {
    const qd = (m.data as UiQuestionsData) || ({} as UiQuestionsData);
    const qs: UiQuestionItem[] = Array.isArray(qd?.questions) ? qd.questions : [];

    // Convert UiQuestionItem[] to Question[] for QuestionsPanel
    const questions = qs.map((q) => ({
      key: q.key,
      question: q.question,
      type: q.type as
        | 'text'
        | 'textarea'
        | 'email'
        | 'email_list'
        | 'datetime'
        | 'date'
        | 'time'
        | 'number'
        | 'select'
        | 'multiselect'
        | undefined,
      required: q.required,
      placeholder: q.placeholder,
      options: q.options,
    }));

    // Convert steps to the format expected by QuestionsPanel
    const steps = Array.isArray(qd?.steps)
      ? qd.steps.map((s) => ({
          id: s.id || '',
          tool: s.tool || '',
          appId: s.appId,
          credentialId: s.credentialId,
          action: s.action,
        }))
      : [];

    return (
      <ChatMessage role="assistant">
        <QuestionsPanel
          runId={runId || ''}
          questions={questions}
          onSubmitted={() => {}}
          steps={steps}
        />
      </ChatMessage>
    );
  }

  if (m.type === 'output') {
    const od = m.data as UiOutputData;
    const type =
      od?.type === 'summary'
        ? 'summary'
        : od?.type === 'json' || od?.type === 'markdown'
          ? 'code'
          : 'text';
    return (
      <ChatMessage role="assistant">
        <OutputCard
          title={od?.title || 'Output'}
          content={String(od?.content || '')}
          type={type}
          data={od?.data}
          presentation={od?.presentation}
        />
      </ChatMessage>
    );
  }

  if (m.type === 'params') {
    const paramsData = (m.data as UiParamsData) || ({ items: [] } as UiParamsData);
    const items = Array.isArray(paramsData.items) ? paramsData.items : [];
    const title = typeof paramsData.title === 'string' ? paramsData.title : 'Inputs';
    return (
      <ChatMessage role="assistant">
        <ParamsCard title={title} items={items} />
      </ChatMessage>
    );
  }

  if (m.type === 'undo') {
    const ud = m.data as UiUndoData;
    return (
      <ChatMessage role="assistant">
        <UndoCard data={{ available: !!ud?.available }} />
      </ChatMessage>
    );
  }

  // Fallback: plain assistant text
  return (
    <ChatMessage role="assistant">
      {m.content && (
        <div className="inline-block max-w-[85%] bg-muted/60 rounded-xl px-5 py-4 relative">
          <div className="absolute top-2 right-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                navigator.clipboard.writeText(String(m.content || ''));
                toast({ title: 'Copied', description: 'Response copied to clipboard' });
              }}
              aria-label="Copy response"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <MarkdownView content={String(m.content || '')} />
        </div>
      )}
    </ChatMessage>
  );
};

interface PlanMessageProps {
  data: UiPlanData;
  runId?: string;
  toast: (options: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
}

function PlanMessage({ data, runId, toast }: PlanMessageProps) {
  const [handled, setHandled] = useState(false);
  const steps: UiPlanStep[] = data?.steps || [];
  const awaitingApproval = data?.awaitingApproval === true;
  const dataSource = getDataSource();
  const normalizedMode =
    data?.mode === 'approval'
      ? 'approval'
      : data?.mode === 'plan'
        ? 'preview'
        : 'auto';
  const plan = {
    intent: data?.intent || 'Plan',
    tools: data?.tools || [],
    actions: data?.actions || [],
    mode: normalizedMode,
    steps,
  };

  const canReview = awaitingApproval && !!runId && !handled;
  const approvedStepIds = steps
    .map((step) => {
      if (typeof step.id === 'string' && step.id.trim()) return step.id;
      if (typeof step.id === 'number') return String(step.id);
      return undefined;
    })
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const handleApprove = canReview
    ? async () => {
        try {
          await dataSource.approve(runId!, approvedStepIds);
          setHandled(true);
          toast({
            title: 'Plan approved',
            description:
              approvedStepIds.length > 0
                ? `Approved ${approvedStepIds.length} step${
                    approvedStepIds.length === 1 ? '' : 's'
                  }.`
                : 'Plan approved.',
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unable to approve this run.';
          toast({
            title: 'Approval failed',
            description: message,
            variant: 'destructive',
          });
        }
      }
    : undefined;

  const handleReject = canReview
    ? async () => {
        try {
          await dataSource.cancel(runId!);
          setHandled(true);
          toast({
            title: 'Run cancelled',
            description: 'Execution halted and the plan was discarded.',
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unable to cancel this run.';
          toast({
            title: 'Cancel failed',
            description: message,
            variant: 'destructive',
          });
        }
      }
    : undefined;

  return (
    <ChatMessage role="assistant">
      <PlanCard data={plan} runId={runId} onConfirm={handleApprove} onReject={handleReject} />
    </ChatMessage>
  );
}

export default MessageItem;
