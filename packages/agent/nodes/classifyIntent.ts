import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';

export const classifyIntent: Node<RunState> = async (s) => {
  const text = s.input.prompt ?? s.input.messages?.map((m) => m.content).join('\n') ?? '';
  const intent = /\b(meeting|calendar|schedule)\b/i.test(text)
    ? 'calendar.schedule'
    : /\bslack|notify\b/i.test(text)
      ? 'slack.notify'
      : 'unknown';
  return {
    scratch: { ...s.scratch, intent, intentMeta: { confidence: intent === 'unknown' ? 0.4 : 0.9 } },
  };
};
