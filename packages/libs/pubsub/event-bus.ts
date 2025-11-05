// event-bus.ts
import type { PubSubChannel } from './channels.js';

export type RunEventType = string;

export interface RunEvent {
  id: string;
  origin: string;
  type: RunEventType;
  runId: string;
  ts: string;
  payload?: unknown;
}

export interface RunEventBus {
  // Channel is required so publishers and subscribers specify intent.
  publish(
    runId: string,
    event: Omit<RunEvent, 'runId' | 'ts' | 'id' | 'origin'>,
    channel: PubSubChannel,
  ): Promise<void>;

  // Subscribe to a specific channel for a run. Handlers registered on one
  // channel won't receive events published to another channel for the same run.
  on(
    runId: string,
    handler: (event: RunEvent) => void,
    channel: PubSubChannel,
    opts?: { label?: string },
  ): () => void; // returns unsubscribe
}
