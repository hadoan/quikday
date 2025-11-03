import * as React from 'react';
import type {
  UiRunSummary,
  UiPlanData,
  UiRunData,
  UiLogData,
  UiOutputData,
  UiUndoData,
  UiMessage,
  UiPlanStep,
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
      const m = messages[i] as UiMessage | undefined;
      const runData = (m?.data as unknown) as UiRunData | undefined;
      if (m?.type === 'run' && runData?.status) {
        console.log('🔎 Found run message at index', i, 'with status:', runData.status);
        return String(runData.status);
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
        const content = ((m.data as unknown) as UiOutputData | undefined)?.content as string | undefined;
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

  // Create a lightweight stable key for messages when possible and
  // dedupe repeated plan messages which sometimes arrive twice
  // (e.g. plan + approval plan updates). We only dedupe plan cards
  // to avoid unintentionally collapsing other message types.
  const uniqueMessages = React.useMemo(() => {
    const seen = new Set<string>();
    const out: typeof dedupedMessages = [];

    const makeKey = (m: UiMessage | undefined, i: number) => {
      // Prefer an explicit id if present
  // Note: UiMessage does not define an `id` field in the view model, but
  // some upstream code may attach it. Guard safely by treating the
  // message as a generic record and checking for an `id` property.
  const runtimeId = m ? ((m as unknown) as Record<string, unknown>)['id'] : undefined;
  if (typeof runtimeId === 'string') return `id:${runtimeId}`;
      // For plan messages, try to derive a stable key from intent + step ids
      if (m?.type === 'plan' && m?.data) {
        try {
          const dataRec = (m.data as unknown) as Record<string, unknown> | undefined;
          const stepsRaw = dataRec?.['steps'];
          if (Array.isArray(stepsRaw)) {
            const steps = stepsRaw as UiPlanStep[];
            const stepIds = steps.map((s) => s?.id || s?.tool || JSON.stringify(s)).join(',');
            return `plan:${String(dataRec?.['intent'] || '')}:${stepIds}`;
          }
        } catch {
          // fallthrough
        }
      }
      // Fallback: use serialized data (cheap) or index
      try {
        return `${String(m.type || m.role || 'msg')}:${JSON.stringify(m.data ?? m.content ?? {})}`;
      } catch {
        return `idx:${i}`;
      }
    };

  for (let i = 0; i < (dedupedMessages?.length || 0); i++) {
  const m = dedupedMessages[i] as UiMessage | undefined;
      if (!m) continue;
      const k = makeKey(m, i);

      // Only dedupe plan messages (skip adding duplicates of same plan key)
      if (m.type === 'plan') {
        if (seen.has(k)) continue;
        seen.add(k);
      }

      out.push(m);
    }

    return out;
  }, [dedupedMessages]);

  return (
    <div className="space-y-6">
      {uniqueMessages?.map((m, i) => {
        const msg = m as UiMessage | undefined;
        if (!msg) return null;
        // compute a more stable key similar to makeKey above so React can track
        const computeKey = (m: UiMessage | undefined, i: number) => {
            const runtimeId = m ? ((m as unknown) as Record<string, unknown>)['id'] : undefined;
            if (typeof runtimeId === 'string') return `id:${runtimeId}`;
            if (m?.type === 'plan' && m?.data) {
              try {
                const dataRec = (m.data as unknown) as Record<string, unknown> | undefined;
                const stepsRaw = dataRec?.['steps'];
                if (Array.isArray(stepsRaw)) {
                  const steps = stepsRaw as UiPlanStep[];
                  const stepIds = steps.map((s) => s?.id || s?.tool || JSON.stringify(s)).join(',');
                  return `plan:${String(dataRec?.['intent'] || '')}:${stepIds}`;
                }
              } catch {
                // fallthrough
              }
          }
          try {
            return `${String(m?.type || m?.role || 'msg')}:${JSON.stringify(m?.data ?? m?.content ?? {})}`;
          } catch {
            return `idx:${i}`;
          }
        };
        const key = computeKey(msg, i);

        if (m.role === 'user') {
          return (
            <ChatMessage key={i} role="user">
              <p className="text-sm">{m.content}</p>
            </ChatMessage>
          );
        }

        // Assistant messages: render structured types with corresponding cards
        if (m.type === 'plan') {
          const pd = m.data as UiPlanData & { awaitingApproval?: boolean };
          const steps = pd?.steps || [];
          const awaitingApproval = pd?.awaitingApproval === true;
          const plan = {
            intent: pd?.intent || 'Plan',
            tools: pd?.tools || [],
            actions: pd?.actions || [],
            mode: 'preview',
            steps: steps,
          };

          // Only allow approve while the run is actively awaiting_approval.
          // This prevents confirming steps after the run has already completed.
          const canApprove =
            flags.liveApprovals && !!runId && steps.length > 0 && lastStatus === 'awaiting_approval';
          
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
                  const ids = steps.map((s) => s.id);
                  if (pd?.awaitingApproval && typeof dataSource.confirmSteps === 'function') {
                    await dataSource.confirmSteps(runId!, ids);
                  } else {
                    await dataSource.approve(runId!, ids);
                  }
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
