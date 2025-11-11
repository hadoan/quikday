import React from 'react';
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
import QuestionsPanel from '@/components/QuestionsPanel';
import { useToast } from '@/hooks/use-toast';
import type {
  UiRunSummary,
  UiPlanData,
  UiPlanStep,
  UiRunData,
  UiLogData,
  UiOutputData,
  UiUndoData,
  UiQuestionsData,
  UiQuestionItem,
} from '@/lib/datasources/DataSource';

interface MessageItemProps {
  message: any;
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
    const pd = m.data as UiPlanData;
    const steps: UiPlanStep[] = pd?.steps || [];
    const plan = {
      intent: pd?.intent || 'Plan',
      tools: pd?.tools || [],
      actions: pd?.actions || [],
      mode: (pd?.mode === 'approval'
        ? 'approval'
        : pd?.mode === 'auto'
          ? 'auto'
          : 'preview') as const,
      steps: steps,
    };
    const awaitingApproval = pd?.awaitingApproval === true || pd?.mode === 'approval';
    // Approval logic omitted for brevity; can be added as needed
    return (
      <ChatMessage role="assistant">
        <PlanCard data={plan} runId={runId} />
      </ChatMessage>
    );
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

  if (m.type === 'questions') {
    const qd = (m.data as UiQuestionsData) || ({} as UiQuestionsData);
    const qs: UiQuestionItem[] = Array.isArray(qd?.questions) ? qd.questions : [];
    const steps = Array.isArray(qd?.steps) ? qd.steps : [];
    return (
      <ChatMessage role="assistant">
        <QuestionsPanel
          runId={runId || ''}
          questions={qs as any}
          steps={steps as any}
          onSubmitted={() => {}}
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
          presentation={(od as any)?.presentation}
        />
      </ChatMessage>
    );
  }

  if (m.type === 'params') {
    const data = (m.data as any) || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const title = typeof data.title === 'string' ? data.title : 'Inputs';
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

export default MessageItem;
