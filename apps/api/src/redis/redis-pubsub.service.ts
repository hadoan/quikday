import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface RunEvent {
  type: 'connection_established' | 'run_status' | 'run_completed' | 'step_succeeded' | 'step_failed';
  runId: string;
  payload: any;
  ts: string;
}

@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private publisher: Redis;
  private subscriber: Redis;
  private eventHandlers = new Map<string, Set<(event: RunEvent) => void>>();

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

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
      try {
        const event: RunEvent = JSON.parse(message);
        this.logger.log(`📨 Received event on ${channel}: ${event.type}`);
        
        // Notify all handlers for this channel
        const handlers = this.eventHandlers.get(channel);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(event);
            } catch (error) {
              this.logger.error(`❌ Error in event handler:`, error);
            }
          });
        }
      } catch (error) {
        this.logger.error(`❌ Failed to parse message from ${channel}:`, error);
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
   */
  async publishRunEvent(runId: string, event: Omit<RunEvent, 'runId' | 'ts'>): Promise<void> {
    const channel = `run:${runId}`;
    const fullEvent: RunEvent = {
      ...event,
      runId,
      ts: new Date().toISOString(),
    };

    try {
      await this.publisher.publish(channel, JSON.stringify(fullEvent));
      this.logger.log(`📤 Published ${event.type} to ${channel}`);
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
    
    if (!this.eventHandlers.has(channel)) {
      this.eventHandlers.set(channel, new Set());
    }
    
    this.eventHandlers.get(channel)!.add(handler);
    this.logger.log(`🔔 Added handler for ${channel} (total: ${this.eventHandlers.get(channel)!.size})`);

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
   * Get stats about current subscriptions
   */
  getStats() {
    const totalChannels = this.eventHandlers.size;
    const totalHandlers = Array.from(this.eventHandlers.values())
      .reduce((sum, handlers) => sum + handlers.size, 0);
    
    return {
      channels: totalChannels,
      handlers: totalHandlers,
      connected: this.publisher.status === 'ready' && this.subscriber.status === 'ready',
    };
  }

  async onModuleDestroy() {
    this.logger.log('🔌 Shutting down Redis Pub/Sub service');
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}
