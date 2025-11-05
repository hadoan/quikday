# WebSocket Connection Event Fix

## Issue

When refreshing the page or connecting to WebSocket, a "connected" status was being treated as a run execution status, causing the UI to show a "Running" card incorrectly.

## Root Cause

The WebSocket connection acknowledgment was using `type: 'run_status'` with `payload: { status: 'connected' }`, which the frontend interpreted as a run execution state change.

## Solution

### Backend Changes

**File**: `apps/api/src/websocket/websocket.service.ts`

Changed from:

```typescript
this.sendMessage(ws, {
  type: 'run_status',
  payload: { status: 'connected' },
  ts: new Date().toISOString(),
  runId,
});
```

To:

```typescript
this.sendMessage(ws, {
  type: 'connection_established',
  payload: { message: 'Connected to run stream' },
  ts: new Date().toISOString(),
  runId,
});
```

**File**: `apps/api/src/redis/redis-pubsub.service.ts`

Updated RunEvent type:

```typescript
export interface RunEvent {
  type:
    | 'connection_established'
    | 'run_status'
    | 'run_completed'
    | 'step_succeeded'
    | 'step_failed';
  // ...
}
```

### Frontend Changes

**File**: `apps/web/src/lib/datasources/DataSource.ts`

Added new event type:

```typescript
export type UiEventType =
  | 'connection_established' // ← New
  | 'plan_generated'
  | 'step_started';
// ... other types
```

**File**: `apps/web/src/pages/Index.tsx`

Added handler for connection event:

```typescript
switch (event.type) {
  case 'connection_established': {
    // Just log connection, don't show a card
    console.log('[Index] WebSocket connected:', event.payload.message);
    break;
  }
  // ... other cases
}
```

## Behavior

### Before

- ❌ Shows "Running" card when WebSocket connects
- ❌ Confusing status display on page refresh
- ❌ "connected" treated as run execution status

### After

- ✅ Connection logged to console only
- ✅ No card shown for connection event
- ✅ Clean separation: connection events vs run status events
- ✅ UI only shows cards for actual run status changes (running, succeeded, failed)

## Event Types

### Connection Events (no UI card)

- `connection_established` - WebSocket connected to backend

### Run Status Events (show UI card)

- `run_status` - Run status changed (queued, running, failed, etc.)
- `run_completed` - Run finished successfully
- `step_succeeded` - Step completed
- `step_failed` - Step failed

## Testing

1. **Refresh page**: Should see console log "WebSocket connected: Connected to run stream"
2. **Submit run**: Should see "Running" card only when run actually starts executing
3. **No false status cards**: Connection event doesn't create status cards

---

© 2025 Quik.day
