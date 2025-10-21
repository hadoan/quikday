import type { Node } from '../runtime/graph.js';
import type { RunState } from '../state/types.js';
import { registry } from '../registry/registry.js';
import { z } from 'zod';

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

  for (const step of s.scratch!.plan ?? []) {
    const tool = registry.get(step.tool);
    const args = tool.in.parse(step.args);

    const result = await withRetry(async () => registry.call(step.tool, args, s.ctx), {
      retries: 3,
      baseMs: 500,
      maxMs: 5000,
    });
    commits.push({ stepId: step.id, result });

    if (tool.undo) {
      const uArgs = await deriveUndoArgs(tool, result, args);
      undo.push({ stepId: step.id, tool: step.tool, args: uArgs });
    }
  }

  return { output: { ...s.output, commits, undo } };
};
