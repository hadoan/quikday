import { AsyncLocalStorage } from 'node:async_hooks';
import type { LlmCallMetadata } from './types.js';

type LlmContextValue = Partial<LlmCallMetadata> & { runId?: string };

const storage = new AsyncLocalStorage<LlmContextValue>();

export const withLlmContext = async <T>(context: LlmContextValue, fn: () => Promise<T>): Promise<T> =>
  await new Promise<T>((resolve, reject) => {
    storage.run(context, async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });

export const getLlmContext = (): LlmContextValue | undefined => storage.getStore();
