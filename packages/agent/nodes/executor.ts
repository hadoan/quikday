import type { Node } from '../runtime/graph';
import type { RunState } from '../state/types';
import { registry } from '../registry/registry';
import { z } from 'zod';
import { events } from '../observability/events';

// Minimal withRetry and deriveUndoArgs stubs for build-time
async function withRetry<T>(
  fn: () => Promise<T>,
  _opts: { retries: number; baseMs: number; maxMs: number },
): Promise<T> {
  return fn();
}

async function deriveUndoArgs(_tool: any, _result: any, args: any) {
  // Pass-through for now
  return args;
}

export const executor: Node<RunState> = async (s) => {
  const commits: any[] = [];
  const undo: any[] = [];

  for (const step of s.scratch?.plan ?? []) {
    const tool = registry.get(step.tool);
    const args = tool.in.parse(step.args);

    events.toolCalled(s, step.tool, args);
    const startedAt = performance.now?.() ?? Date.now();

    try {
      const result = await withRetry(async () => registry.call(step.tool, args, s.ctx), {
        retries: 3,
        baseMs: 500,
        maxMs: 5000,
      });

      const duration = (performance.now?.() ?? Date.now()) - startedAt;
      events.toolSucceeded(s, step.tool, result, duration);
      commits.push({ stepId: step.id, result });

      if (tool.undo) {
        const uArgs = await deriveUndoArgs(tool, result, args);
        undo.push({ stepId: step.id, tool: step.tool, args: uArgs });
      }
    } catch (error) {
      events.toolFailed(s, step.tool, error);
      (s as any).error = {
        node: 'executor',
        message: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  if (undo.length > 0) {
    events.undoEnqueued(s, undo);
  }

  return { output: { ...s.output, commits, undo } };
};
