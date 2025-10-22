// runtime/safeNode.ts
import type { RunState } from '../state/types';

/**
 * Signature-preserving error guard for graph nodes.
 * Works with any node shape: (state, ctx), (state, ctx, signal), etc.
 */
export const safeNode =
  <T extends (...args: any[]) => any>(nodeName: string, fn: T) =>
  async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    try {
      // Keep the original signature and return type. Await once to avoid nested Promises.
      const res = await fn(...args);
      return await (res as Promise<Awaited<ReturnType<T>>>);
    } catch (err) {
      // Attempt to annotate state + emit events if available
      const [state, ctx] = args as unknown as [RunState | undefined, any];
      if (args.length >= 1 && state && typeof state === 'object') {
        (state as any).error = {
          node: nodeName,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        };
      }
      ctx?.events?.emit?.('step_failed', { node: nodeName, error: (state as any)?.error });

      // Route to fallback by returning the edge label.
      // Cast to satisfy the original node return type.
      return 'fallback' as unknown as Awaited<ReturnType<T>>;
    }
  };
