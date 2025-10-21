import type { Node } from '../runtime/graph.js';
import type { RunState } from '../state/types.js';

export const summarize: Node<RunState> = async (s) => {
  // Simple summarizer stub - replace with real LLM call in full implementation
  const text = `Summary: ${JSON.stringify({ commits: s.output?.commits, diff: s.output?.diff })}`;
  return { output: { ...s.output, summary: text } };
};
