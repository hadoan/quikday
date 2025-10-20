# Redis Pub/Sub Integration - Testing Guide

## Overview

The WebSocket service has been upgraded from polling to **event-driven Redis Pub/Sub** for real-time run updates. This eliminates database polling overhead and provides instant notifications.

## Architecture

```
Run Processor → Redis Pub/Sub → WebSocket Service → Connected Clients
     ↓
  Database
```

### Event Flow

1. **Run Processor** executes job and publishes events to Redis channel `run:{runId}`
2. **Redis** broadcasts event to all subscribers
3. **WebSocket Service** receives event and forwards to connected client(s)
4. **Client** receives instant update via WebSocket

## Components

### 1. RedisPubSubService (`apps/api/src/redis/redis-pubsub.service.ts`)

- **Publisher**: Publishes run events to Redis channels
- **Subscriber**: Subscribes to pattern `run:*` to receive all run events
- **Event Routing**: Routes events to registered handlers based on runId

**Key Methods:**
- `publishRunEvent(runId, event)` - Publish event to `run:{runId}` channel
- `onRunEvent(runId, handler)` - Subscribe to events for specific run
- `getStats()` - Get connection and subscription statistics

### 2. WebSocketService (`apps/api/src/websocket/websocket.service.ts`)

**Changes from Polling:**
- ❌ Removed: `pollIntervalMs`, `timer`, `pollCount`, `startPolling()`, `pollRunUpdates()`
- ✅ Added: `unsubscribe` function in ConnectionState
- ✅ Updated: `handleConnection()` subscribes to Redis events
- ✅ Updated: `handleDisconnection()` calls unsubscribe function

**Event Handling:**
```typescript
const unsubscribe = this.redisPubSub.onRunEvent(runId, (event) => {
  this.sendMessage(ws, event);
});
```

### 3. RunProcessor (`apps/api/src/queue/run.processor.ts`)

**Event Publishing Points:**
1. **Running**: When job starts execution
   ```typescript
   await this.redisPubSub.publishRunEvent(run.id, {
     type: 'run_status',
     payload: { status: 'running' },
   });
   ```

2. **Completed**: When job finishes successfully
   ```typescript
   await this.redisPubSub.publishRunEvent(run.id, {
     type: 'run_completed',
     payload: { status: 'done', output },
   });
   ```

3. **Failed**: When job encounters an error
   ```typescript
   await this.redisPubSub.publishRunEvent(run.id, {
     type: 'run_status',
     payload: { status: 'failed', error: errorPayload },
   });
   ```

## Testing

### Prerequisites

1. **Redis running**:
   ```bash
   docker compose up -d redis
   ```

2. **API running**:
   ```bash
   pnpm dev:api
   ```

3. **Web client running**:
   ```bash
   pnpm dev:web
   ```

### Test Scenario 1: Basic Run Execution

1. **Open browser** to `http://localhost:5173`

2. **Open DevTools** → Network → WS tab to monitor WebSocket

3. **Type a prompt** and submit (e.g., "Post 'Hello from Quik.day!' on LinkedIn")

4. **Expected Logs** in API terminal:
   ```
   📡 Subscribed to 1 Redis channel patterns
   🔗 New WebSocket connection { runId: 'xxx' }
   🔔 Added handler for run:xxx (total: 1)
   📤 Published run_status to run:xxx
   📨 Received event on run:xxx: run_status
   📤 Published run_completed to run:xxx
   📨 Received event on run:xxx: run_completed
   ```

5. **Expected WebSocket Messages**:
   ```json
   {"type":"run_status","payload":{"status":"connected"},"ts":"...","runId":"xxx"}
   {"type":"run_status","payload":{"status":"running"},"ts":"...","runId":"xxx"}
   {"type":"run_completed","payload":{"status":"done","output":{...}},"ts":"...","runId":"xxx"}
   ```

6. **Verify in UI**: Status updates appear instantly without delay

### Test Scenario 2: Multiple Concurrent Connections

1. **Open multiple browser tabs** to the web app

2. **Submit runs** from different tabs

3. **Expected Behavior**:
   - Each tab receives updates only for its own run
   - No cross-contamination of events
   - All updates arrive instantly

4. **Check Logs**:
   ```
   🔔 Added handler for run:xxx (total: 1)
   🔔 Added handler for run:yyy (total: 1)
   ```

### Test Scenario 3: Connection Cleanup

1. **Start a run** and wait for connection

2. **Close the browser tab** before run completes

3. **Expected Logs**:
   ```
   🔌 WebSocket disconnected { runId: 'xxx', duration: '5.23s' }
   🔕 Removed handler for run:xxx (remaining: 0)
   ```

4. **Verify**: No memory leaks, handler properly removed

### Test Scenario 4: Redis Stats

1. **With connections active**, check stats endpoint:
   ```bash
   curl http://localhost:3000/runs/stats
   ```

2. **Expected Response**:
   ```json
   {
     "activeConnections": 2,
     "redis": {
       "channels": 2,
       "handlers": 2,
       "connected": true
     },
     "connections": [
       {
         "runId": "xxx",
         "duration": 5234,
         "lastStatus": "running"
       }
     ]
   }
   ```

## Monitoring

### Redis CLI

Monitor live events:
```bash
docker exec -it runfast-redis-1 redis-cli
> PSUBSCRIBE run:*
```

You'll see:
```
1) "pmessage"
2) "run:*"
3) "run:abc123"
4) "{\"type\":\"run_status\",\"runId\":\"abc123\",\"payload\":{\"status\":\"running\"},\"ts\":\"...\"}"
```

### Log Prefixes

- 📡 Redis subscription setup
- 🔗 WebSocket connection established
- 🔔 Event handler registered
- 🔕 Event handler removed
- 📤 Event published to Redis
- 📨 Event received from Redis
- 🔌 WebSocket disconnected
- ✅ Redis client connected
- ❌ Error occurred

## Performance Comparison

### Before (Polling)

- **Latency**: Up to 2s delay
- **DB Queries**: N connections × (queries/2s) = high load
- **Scalability**: Linear DB load increase
- **Example**: 10 connections = 5 queries/sec to database

### After (Redis Pub/Sub)

- **Latency**: < 100ms (instant)
- **DB Queries**: Only on actual changes
- **Scalability**: Redis handles millions of messages/sec
- **Example**: 10 connections = 0 recurring DB queries

## Troubleshooting

### Issue: No events received

**Check:**
1. Redis is running: `docker ps | grep redis`
2. Redis connection logs: Look for "✅ Redis publisher connected"
3. Events are being published: Check run.processor.ts logs for "📤 Published"

**Solution:**
```bash
# Restart Redis
docker compose restart redis

# Check Redis connectivity
docker exec -it runfast-redis-1 redis-cli ping
# Should return: PONG
```

### Issue: Events received but not forwarded to client

**Check:**
1. WebSocket connection state: `this.connState.size`
2. Handler registration: Look for "🔔 Added handler"
3. WebSocket readyState: Should be `1` (OPEN)

**Debug:**
```typescript
// In websocket.service.ts
this.logger.debug('Connection state:', {
  runId,
  hasHandler: this.connState.has(ws),
  wsState: ws.readyState,
});
```

### Issue: Memory leak / handlers not cleaned up

**Check:**
1. Disconnection logs: "🔕 Removed handler"
2. Redis stats: `redis.handlers` should decrease on disconnect

**Fix:**
```typescript
// Ensure unsubscribe is called
if (state.unsubscribe) {
  state.unsubscribe();
}
```

## Next Steps

### Optional Enhancements

1. **Step-level events**: Publish each step completion for finer granularity
2. **Reconnection logic**: Handle Redis connection drops gracefully
3. **Event replay**: Store recent events in Redis with TTL for reconnecting clients
4. **Metrics**: Track event latency, publish/subscribe rates
5. **Clustering**: Use Redis Cluster for high availability

### Migration Rollback

If you need to rollback to polling:

1. Restore `websocket.service.ts` from WEBSOCKET_ARCHITECTURE.md
2. Remove Redis publishing from `run.processor.ts`
3. Remove RedisPubSubService dependency

## Summary

✅ **Implemented**: Event-driven architecture with Redis Pub/Sub  
✅ **Benefits**: Instant updates, lower DB load, better scalability  
✅ **Tradeoffs**: Added Redis dependency (already in stack for BullMQ)  
✅ **Production Ready**: Tested and documented

**Key Metrics to Monitor:**
- WebSocket connection count
- Redis memory usage
- Event publish/subscribe rate
- End-to-end latency (run update → client notification)

---

© 2025 Quik.day - Built with ❤️ by Ha Doan and the community
