import * as React from 'react';
import MessageList from './MessageList';
import type { UiRunSummary } from '@/apis/runs';

export function ChatStream({
  runId,
  messages,
}: {
  runId?: string;
  messages: UiRunSummary['messages'];
}) {
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

  return <MessageList runId={runId} messages={dedupedMessages} />;
}

export default ChatStream;
