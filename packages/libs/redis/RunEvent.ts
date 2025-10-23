// ./RunEvent.ts
// Allow any string for RunEventType so the pub/sub surface is permissive across services.
// Event producers/consumers across packages currently use slightly different literal
// formats (e.g., 'run_completed' vs 'run.completed'); using `string` here avoids
// type incompatibilities while keeping the runtime shape flexible. We can narrow
// this back to a strict union later if desired.
export type RunEventType = string;

export interface RunEvent {
  // NEW: unique event id + origin for loop prevention
  id: string; // uuid v7 (or ulid)
  origin: string; // e.g. "runs-api" | "ws-gateway" | "langgraph"

  // Existing fields
  type: RunEventType;
  runId: string;
  ts: string; // ISO timestamp

  // payload is whatever your producers send
  payload?: unknown;
}
