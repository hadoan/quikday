// runtime/safeNode.ts
import { RunEventBus } from '@quikday/libs';
import type { RunState } from '../state/types.js';

/**
 * Signature-preserving error guard for graph nodes.
 * Works with any node shape: (state, ctx), (state, ctx, signal), etc.
 */
export const safeNode =
  <T extends (...args: any[]) => any>(nodeName: string, fn: T, eventBus: RunEventBus) =>
  async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    try {
      // Keep the original signature and return type. Await once to avoid nested Promises.
      // Call the wrapped node with the original parameters and append the shared eventBus
      // so nodes with signature (state, eventBus) or (state, ctx, eventBus) continue to work.
      const res = await fn(...(args as any[]), eventBus);
      return await (res as Promise<Awaited<ReturnType<T>>>);
    } catch (err) {
      // Allow graph-level control flow errors to bubble (do not convert to fallback)
      const code = (err as any)?.code || (err as any)?.name || (err as any)?.message;
      if (code === 'GRAPH_HALT_AWAITING_APPROVAL') {
        throw err;
      }
      // Attempt to annotate state + emit events if available
      const [state, ctx] = args as unknown as [RunState | undefined, any];
      if (args.length >= 1 && state && typeof state === 'object') {
        (state as any).error = {
          node: nodeName,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        };
        // Map common operational errors to a clearer fallback reason for UX
        const msg = ((err instanceof Error ? err.message : String(err)) || '').toLowerCase();
        let reason = 'unspecified';
        if (msg.includes('tool not found')) reason = 'unspecified';
        (state as any).scratch = { ...(state as any).scratch, fallbackReason: reason };
      }
      ctx?.events?.emit?.('step_failed', { node: nodeName, error: (state as any)?.error });

      // Route to fallback by returning the edge label.
      // Cast to satisfy the original node return type.
      return 'fallback' as unknown as Awaited<ReturnType<T>>;
    }
  };
