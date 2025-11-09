import * as React from 'react';
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
import { ChatMessage } from './ChatMessage';
import MarkdownView from '@/components/common/MarkdownView';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PlanCard } from '@/components/cards/PlanCard';
import { RunCard } from '@/components/cards/RunCard';
import { LogCard } from '@/components/cards/LogCard';
import { OutputCard } from '@/components/cards/OutputCard';
import { ParamsCard } from '@/components/cards/ParamsCard';
import { UndoCard } from '@/components/cards/UndoCard';
import { getDataSource, getFeatureFlags } from '@/lib/flags/featureFlags';
import QuestionsPanel from '@/components/QuestionsPanel';

export function ChatStream({
  runId,
  messages,
}: {
  runId?: string;
  messages: UiRunSummary['messages'];
}) {
  const { toast } = useToast();
  const flags = getFeatureFlags();
  const dataSource = getDataSource();

  // Find last known run status from messages (if any)
  const lastStatus = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as any;
      if (m?.type === 'run' && m?.data?.status) {
        console.log('🔎 Found run message at index', i, 'with status:', m.data.status);
        return String(m.data.status);
      }
    }
    console.log('🔎 No run message found in', messages.length, 'messages');
    return undefined as string | undefined;
  }, [messages]);

  // Deduplicate assistant text that repeats output summaries (order-agnostic)
  const dedupedMessages = React.useMemo(() => {
    const out: typeof messages = [];
    const norm = (s: unknown) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');
    // First collect all output contents so we can suppress earlier assistant duplicates
    const outputTexts = new Set<string>();
    for (const m of messages ?? []) {
      if (m?.type === 'output') {
        const content = (m.data as any)?.content as string | undefined;
        const n = norm(content);
        if (n) outputTexts.add(n);
      }
    }
    // Now build filtered list
    for (const m of messages ?? []) {
      if (!m) continue;
      if (m.role === 'assistant' && !m.type && typeof m.content === 'string') {
        const c = norm(m.content);
        if (c && outputTexts.has(c)) continue; // skip duplicate plain assistant text
      }
      out.push(m);
    }
    return out;
  }, [messages]);

  return (
    <div className="space-y-6">
      {dedupedMessages?.map((m, i) => {
        if (!m) return null;

        if (m.role === 'user') {
          return (
            <ChatMessage key={i} role="user">
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
            // Map UiPlanData.mode ('plan' | 'auto' | 'approval') to PlanCard mode ('preview' | 'auto' | 'approval')
            mode: (pd?.mode === 'approval' ? 'approval' : pd?.mode === 'auto' ? 'auto' : 'preview') as const,
            steps: steps,
          };

          const awaitingApproval = pd?.awaitingApproval === true || pd?.mode === 'approval';
          
          // Only show approve button if:
          // 1. This is an approval plan card (awaitingApproval === true)
          // 2. Current run status is awaiting_approval
          // 3. This is the LAST approval plan card (most recent one)
          const isLastApprovalPlan = awaitingApproval && 
            dedupedMessages.slice(i + 1).every((msg) => 
              !msg || msg.type !== 'plan' || !(msg.data as any)?.awaitingApproval
            );
          
          const canApprove =
            flags.liveApprovals && 
            !!runId && 
            steps.length > 0 && 
            awaitingApproval &&
            isLastApprovalPlan &&
            lastStatus === 'awaiting_approval';
          
          console.log('🔍 Approval button check:', {
            cardIndex: i,
            liveApprovals: flags.liveApprovals,
            hasRunId: !!runId,
            lastStatus,
            stepsCount: steps.length,
            awaitingApproval,
            isLastApprovalPlan,
            canApprove,
          });
          
          const onConfirm = canApprove
            ? async () => {
                try {
                  const stepIds = steps.map((s) => s.id);
                  console.log('[ChatStream] onConfirm called with:', { runId, stepIds });
                  await dataSource.approve(runId, stepIds);
                  console.log('[ChatStream] approve call successful');
                } catch (e) {
                  console.error('approve failed', e);
                }
              }
            : undefined;

          const onReject = canApprove
            ? async () => {
                try {
                  await dataSource.cancel(runId);
                } catch (e) {
                  console.error('reject failed', e);
                }
              }
            : undefined;

          return (
            <ChatMessage key={i} role="assistant">
              <PlanCard data={plan} onConfirm={onConfirm} onReject={onReject} runId={runId} />
            </ChatMessage>
          );
        }

        if (m.type === 'run') {
          return (
            <ChatMessage key={i} role="assistant">
              <RunCard data={m.data as UiRunData} runId={runId} />
            </ChatMessage>
          );
        }

        if (m.type === 'log') {
          const ld = m.data as UiLogData;
          const entries = Array.isArray(ld?.entries) ? (ld.entries as unknown[]) : [];
          const logs = entries
            .map((e) => {
              const step = e as Record<string, unknown>;
              const tool = String(step.tool ?? 'unknown');
              const action =
                typeof step.action === 'string'
                  ? step.action
                  : JSON.stringify(step.request ?? step.response ?? '');
              const time = String(step.time ?? step.startedAt ?? '');
              const status = String(step.status ?? '') === 'succeeded' ? 'success' : 'pending';

              // Prefer a short output preview if available; fallback to response stringified
              const outputsPreview = step.outputsPreview as string | undefined;
              let output: string | undefined = outputsPreview && outputsPreview.trim().length > 0
                ? outputsPreview
                : undefined;
              if (!output) {
                const response = step.response as unknown;
                if (typeof response === 'string') output = response;
                else if (response != null) {
                  try {
                    output = JSON.stringify(response);
                  } catch {
                    output = String(response);
                  }
                }
              }

              return { tool, action, time, status: status as 'success' | 'pending', output };
            })
            .slice(0, 50);

          return (
            <ChatMessage key={i} role="assistant">
              <LogCard logs={logs} />
            </ChatMessage>
          );
        }

        if (m.type === 'questions') {
          const qd = (m.data as UiQuestionsData) || ({} as UiQuestionsData);
          const qs: UiQuestionItem[] = Array.isArray(qd?.questions) ? qd.questions : [];
          return (
            <ChatMessage key={i} role="assistant">
              <QuestionsPanel
                runId={runId || ''}
                questions={qs}
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
            <ChatMessage key={i} role="assistant">
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
            <ChatMessage key={i} role="assistant">
              <ParamsCard title={title} items={items} />
            </ChatMessage>
          );
        }

        if (m.type === 'undo') {
          const ud = m.data as UiUndoData;
          return (
            <ChatMessage key={i} role="assistant">
              <UndoCard data={{ available: !!ud?.available }} />
            </ChatMessage>
          );
        }

        // Fallback: plain assistant text
        return (
          <ChatMessage key={i} role="assistant">
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
      })}
    </div>
  );
}

export default ChatStream;
