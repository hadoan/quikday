import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RunEvent, RunEventBus } from './event-bus';

@Injectable()
export class InMemoryEventBus implements RunEventBus {
  // Map<runKey, Map<subscriberId, handler>> — keep subscriber IDs for better logs
  private handlers = new Map<string, Map<string, (e: RunEvent) => void>>();
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
    if (!set || set.size === 0) {
      this.logger.debug({ msg: 'no handlers for run', runId });
      return;
    }
    // Helpful debug: how many handlers/subscribers will receive this event
    this.logger.debug({ msg: 'handlers count', runId, count: set.size });
    // Call handlers asynchronously (microtask) to avoid deep synchronous recursion
    // if a handler itself publishes events which synchronously invoke other handlers.
    for (const [subId, h] of Array.from(set.entries())) {
      try {
        this.logger.debug({
          msg: 'delivering event to handler',
          runId,
          handlerId: subId,
          event: full,
        });
        // Schedule handler invocation in a microtask and await it so exceptions
        // can be caught here and the publish method remains async-safe.
        await Promise.resolve().then(() => h(full));
        this.logger.verbose({
          msg: 'handler delivered',
          runId,
          handlerId: subId,
          eventId: full.id,
        });
      } catch (e) {
        const err = e as Error;
        // Logger.error(message: string, trace?: string, context?: string)
        this.logger.error(
          `handler threw error for run ${runId} handler=${subId}: ${err?.message}`,
          err?.stack,
          InMemoryEventBus.name,
        );
      }
    }
  }

  on(runId: string, handler: (event: RunEvent) => void, opts?: { label?: string }): () => void {
    const key = `run:${runId}`;
    let map = this.handlers.get(key);
    if (!map) {
      map = new Map();
      this.handlers.set(key, map);
    }

    // Create a subscriber id using provided label, function name or fallback to 'subscriber'
    const base = opts?.label || (handler as any)?.name || 'subscriber';
    const subId = `${base}-${randomUUID().slice(0, 8)}`;
    map.set(subId, handler);
    this.logger.debug({
      msg: 'handler subscribed',
      runId,
      subscriberId: subId,
      totalHandlers: map.size,
    });
    return () => {
      const m = this.handlers.get(key);
      if (!m) return;
      m.delete(subId);
      this.logger.debug({
        msg: 'handler unsubscribed',
        runId,
        subscriberId: subId,
        remaining: m.size,
      });
      if (m.size === 0) {
        this.handlers.delete(key);
        this.logger.verbose({ msg: 'no handlers remain for run, key deleted', runId });
      }
    };
  }
}
