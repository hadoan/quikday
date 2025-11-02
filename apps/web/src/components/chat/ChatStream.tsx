import * as React from 'react';
import type {
  UiRunSummary,
  UiPlanData,
  UiRunData,
  UiLogData,
  UiOutputData,
  UiUndoData,
} from '@/lib/datasources/DataSource';
import { ChatMessage } from './ChatMessage';
import { PlanCard } from '@/components/cards/PlanCard';
import { RunCard } from '@/components/cards/RunCard';
import { LogCard } from '@/components/cards/LogCard';
import { OutputCard } from '@/components/cards/OutputCard';
import { UndoCard } from '@/components/cards/UndoCard';
import { getDataSource, getFeatureFlags } from '@/lib/flags/featureFlags';

export function ChatStream({
  runId,
  messages,
}: {
  runId?: string;
  messages: UiRunSummary['messages'];
}) {
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
          const steps = pd?.steps || [];
          
          const plan = {
            intent: pd?.intent || 'Plan',
            tools: pd?.tools || [],
            actions: pd?.actions || [],
            mode: 'preview' as const,
            steps: steps,
          };

          const canApprove =
            flags.liveApprovals && runId && lastStatus === 'awaiting_approval' && steps.length > 0;
          
          console.log('🔍 Approval button check:', {
            liveApprovals: flags.liveApprovals,
            hasRunId: !!runId,
            lastStatus,
            stepsCount: steps.length,
            canApprove,
          });
          
          const onConfirm = canApprove
            ? async () => {
                try {
                  await dataSource.approve(runId, steps.map((s) => s.id));
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
              <PlanCard data={plan} onConfirm={onConfirm} onReject={onReject} />
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
              return { tool, action, time, status: status as 'success' | 'pending' };
            })
            .slice(0, 50);

          return (
            <ChatMessage key={i} role="assistant">
              <LogCard logs={logs} />
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
              />
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
              <div className="inline-block max-w-[85%] bg-muted/60 rounded-xl px-5 py-3">
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              </div>
            )}
          </ChatMessage>
        );
      })}
    </div>
  );
}

export default ChatStream;
