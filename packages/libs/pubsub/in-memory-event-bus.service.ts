import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RunEvent, RunEventBus } from './event-bus';

@Injectable()
export class InMemoryEventBus implements RunEventBus {
  private handlers = new Map<string, Set<(e: RunEvent) => void>>();
  private SERVICE = process.env.SERVICE_NAME ?? 'monolith';
  private readonly logger = new Logger(InMemoryEventBus.name);

  async publish(
    runId: string,
    event: Omit<RunEvent, 'runId' | 'ts' | 'id' | 'origin'>,
  ): Promise<void> {
    this.logger.debug({ msg: 'publish called', runId, event });
    const full: RunEvent = {
      ...event,
      id: randomUUID(),
      origin: this.SERVICE,
      runId,
      ts: new Date().toISOString(),
    };
    const key = `run:${runId}`;
    const set = this.handlers.get(key);
    if (!set?.size) {
      this.logger.debug({ msg: 'no handlers for run', runId });
      return;
    }
    // Call handlers asynchronously (microtask) to avoid deep synchronous recursion
    // if a handler itself publishes events which synchronously invoke other handlers.
    for (const h of Array.from(set)) {
      try {
        this.logger.debug({
          msg: 'delivering event to handler',
          runId,
          handler: String(h),
          event: full,
        });
        // Schedule handler invocation in a microtask and await it so exceptions
        // can be caught here and the publish method remains async-safe.
        await Promise.resolve().then(() => h(full));
        this.logger.verbose({
          msg: 'handler delivered',
          runId,
          handler: String(h),
          eventId: full.id,
        });
      } catch (e) {
        const err = e as Error;
        // Logger.error(message: string, trace?: string, context?: string)
        this.logger.error(
          `handler threw error for run ${runId} handler=${String(h)}: ${err?.message}`,
          err?.stack,
          InMemoryEventBus.name,
        );
      }
    }
  }

  on(runId: string, handler: (event: RunEvent) => void): () => void {
    const key = `run:${runId}`;
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler);
    this.logger.debug({
      msg: 'handler subscribed',
      runId,
      handler: String(handler),
      totalHandlers: set.size,
    });
    return () => {
      const s = this.handlers.get(key);
      if (!s) return;
      s.delete(handler);
      this.logger.debug({
        msg: 'handler unsubscribed',
        runId,
        handler: String(handler),
        remaining: s.size,
      });
      if (s.size === 0) {
        this.handlers.delete(key);
        this.logger.verbose({ msg: 'no handlers remain for run, key deleted', runId });
      }
    };
  }
}
