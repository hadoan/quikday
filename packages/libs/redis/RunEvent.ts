// ./RunEvent.ts
export type RunEventType =
  | 'job.created'
  | 'run.started'
  | 'node.enter'
  | 'node.exit'
  | 'run_status'
  | 'run.completed'
  | 'run.error';

export interface RunEvent {
  // NEW: unique event id + origin for loop prevention
  id: string;           // uuid v7 (or ulid)
  origin: string;       // e.g. "runs-api" | "ws-gateway" | "langgraph"

  // Existing fields
  type: RunEventType;
  runId: string;
  ts: string;           // ISO timestamp

  // payload is whatever your producers send
  payload?: unknown;
}
