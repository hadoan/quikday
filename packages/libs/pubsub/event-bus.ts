// event-bus.ts
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
  publish(runId: string, event: Omit<RunEvent, 'runId' | 'ts' | 'id' | 'origin'>): Promise<void>;
  on(runId: string, handler: (event: RunEvent) => void, opts?: { label?: string }): () => void; // returns unsubscribe
}
