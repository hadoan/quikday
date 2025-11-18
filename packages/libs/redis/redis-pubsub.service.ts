import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RunEvent, RunEventType } from './RunEvent.js';
import { randomUUID } from 'node:crypto';
import { LRUCache } from 'lru-cache';

@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private publisher: Redis;
  private subscriber: Redis;

  // Handlers keyed by concrete channel name (e.g., run:abc123)
  private eventHandlers = new Map<string, Set<(event: RunEvent) => void>>();

  // NEW: simple idempotency cache (drop duplicates for a short window)
  private dedupe = new LRUCache<string, true>({ max: 5000, ttl: 10_000 });

  // NEW: identify this process as an origin
  private readonly SERVICE = process.env.SERVICE_NAME ?? 'runs-api';
  private readonly redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // NEW: allow handling own-origin events (needed when pub & sub are same process)
  private readonly ignoreSelfOrigin =
    (process.env.REDIS_IGNORE_SELF_ORIGIN ?? 'false').toLowerCase() === 'true';

  constructor() {
    const needsTls = this.redisUrl.startsWith('rediss://');
    let servername: string | undefined;
    try {
      servername = new URL(this.redisUrl).hostname;
    } catch {
      // ignore parse error – TLS will still use default SNI
    }

    const connection = {
      // Use the full REDIS URL (supports rediss:// for TLS endpoints like Redis Cloud/Upstash)
      url: this.redisUrl,
      // Helpful for serverless environments
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      tls: needsTls
        ? {
            servername,
            rejectUnauthorized:
              (process.env.REDIS_TLS_REJECT_UNAUTHORIZED ?? 'false').toLowerCase() === 'true',
          }
        : undefined,
    } as any;

    this.publisher = new Redis(connection);
    this.subscriber = new Redis(connection);

    this.setupSubscriber();
  }

  private setupSubscriber() {
    // Subscribe to all run events using pattern
    this.subscriber.psubscribe('run:*', (err: any, count: any) => {
      if (err) {
        this.logger.error('❌ Failed to subscribe to run events', err);
        return;
      }
      this.logger.log(`📡 Subscribed to ${count} Redis channel patterns`);
    });

    // Handle incoming messages
    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      let event: RunEvent | null = null;

      try {
        event = JSON.parse(message) as RunEvent;
      } catch (error) {
        this.logger.error(`❌ Failed to parse message from ${channel}:`, error);
        return;
      }

      // NEW: basic schema sanity
      if (!event?.id || !event?.type || !event?.runId) {
        this.logger.warn(`⚠️ Dropping malformed event on ${channel}`);
        return;
      }

      // NEW: drop if we’ve already seen this id recently
      if (this.dedupe.has(event.id)) {
        return;
      }
      this.dedupe.set(event.id, true);

      // ✅ Only ignore self-origin when explicitly enabled
      if (this.ignoreSelfOrigin && event.origin === this.SERVICE) {
        return;
      }

      // (Keep log lightweight to avoid floods; comment out if still noisy)
      this.logger.log(`📨 Received event on ${channel}: ${event.type}`);

      // Notify all handlers for this channel
      const handlers = this.eventHandlers.get(channel);
      if (handlers?.size) {
        Array.from(handlers).forEach((handler) => {
          try {
            handler(event);
          } catch (error) {
            this.logger.error(`❌ Error in event handler:`, error);
          }
        });
      }
    });

    this.publisher.on('error', (err: any) => {
      this.logger.error('❌ Redis publisher error:', err);
    });

    this.subscriber.on('error', (err: any) => {
      this.logger.error('❌ Redis subscriber error:', err);
    });

    this.publisher.on('connect', () => {
      this.logger.log('✅ Redis publisher connected');
    });

    this.subscriber.on('connect', () => {
      this.logger.log('✅ Redis subscriber connected');
    });
  }

  /**
   * Publish a run event to Redis
   *
   * NOTE: Do not call this from inside an onRunEvent handler for the same runId
   * unless you’re intentionally emitting a *new* event type/state change.
   */
  async publishRunEvent(
    runId: string,
    event: Omit<RunEvent, 'runId' | 'ts' | 'id' | 'origin'>,
  ): Promise<void> {
    console.log(
      '---------------------------------- publishRunEvent called -----------------------------',
    );
    console.log({ runId, event });
    // return;
    const channel = `run:${runId}`;
    const fullEvent: RunEvent = {
      ...event,
      id: randomUUID(), // NEW
      origin: this.SERVICE, // NEW
      runId,
      ts: new Date().toISOString(),
    };

    try {
      await this.publisher.publish(channel, JSON.stringify(fullEvent));
      // Keep this log—useful, but won’t echo due to origin guard above
      this.logger.log(`📤 Published ${fullEvent.type} to ${channel}`);
    } catch (error) {
      this.logger.error(`❌ Failed to publish to ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to events for a specific run
   */
  onRunEvent(runId: string, handler: (event: RunEvent) => void): () => void {
    const channel = `run:${runId}`;

    // Ensure a single handler set per channel
    let set = this.eventHandlers.get(channel);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(channel, set);
    }

    set.add(handler);
    this.logger.log(`🔔 Added handler for ${channel} (total: ${set.size})`);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(channel);
      if (handlers) {
        handlers.delete(handler);
        this.logger.log(`🔕 Removed handler for ${channel} (remaining: ${handlers.size})`);
        if (handlers.size === 0) {
          this.eventHandlers.delete(channel);
        }
      }
    };
  }

  /**
   * Optional: subscribe to *all* run events, if you need a global monitor.
   * Prefer onRunEvent for per-run routing in most cases.
   */
  onAnyRunEvent(handler: (channel: string, event: RunEvent) => void): () => void {
    const internal = (rawChannel: string, rawMsg: string) => {
      try {
        const e = JSON.parse(rawMsg) as RunEvent;
        if (!e?.id) return;

        if (this.dedupe.has(e.id)) return;
        this.dedupe.set(e.id, true);
        if (e.origin === this.SERVICE) return;

        handler(rawChannel, e);
      } catch {
        /* ignore */
      }
    };

    // Attach low-level listener
    const pmessageListener = (_p: string, ch: string, msg: string) => internal(ch, msg);
    this.subscriber.on('pmessage', pmessageListener);

    return () => {
      this.subscriber.off('pmessage', pmessageListener);
    };
  }

  /**
   * Get stats about current subscriptions
   */
  getStats() {
    const totalChannels = this.eventHandlers.size;
    const totalHandlers = Array.from(this.eventHandlers.values()).reduce(
      (sum, handlers) => sum + handlers.size,
      0,
    );

    return {
      channels: totalChannels,
      handlers: totalHandlers,
      connected: this.publisher.status === 'ready' && this.subscriber.status === 'ready',
      dedupeSize: this.dedupe.size, // NEW: visibility into dedupe cache
    };
  }

  async onModuleDestroy() {
    this.logger.log('🔌 Shutting down Redis Pub/Sub service');
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}
