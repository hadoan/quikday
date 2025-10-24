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

export function ChatStream({ messages }: { messages: UiRunSummary['messages'] }) {
  return (
    <div className="space-y-6">
      {messages?.map((m, i) => {
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
          const plan = {
            intent: pd?.intent || 'Plan',
            tools: pd?.tools || [],
            actions: pd?.actions || [],
            mode: 'plan' as const,
          };

          return (
            <ChatMessage key={i} role="assistant">
              <PlanCard data={plan} />
            </ChatMessage>
          );
        }

        if (m.type === 'run') {
          return (
            <ChatMessage key={i} role="assistant">
              <RunCard data={m.data as UiRunData} />
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
          const type = od?.type === 'summary' ? 'summary' : od?.type === 'json' || od?.type === 'markdown' ? 'code' : 'text';
          return (
            <ChatMessage key={i} role="assistant">
              <OutputCard title={od?.title || 'Output'} content={String(od?.content || '')} type={type} />
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
