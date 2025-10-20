# WebSocket Architecture: Polling vs Event-Driven

## Current Implementation

The WebSocket service currently uses **polling** to push real-time updates to connected clients:

- **Polling Interval**: 2000ms (2 seconds)
- **Scope**: Per-connection polling for specific runId
- **Implementation**: `setInterval` in `pollRunUpdates()` method
- **Termination**: Stops when run reaches terminal state (succeeded/failed/completed/done)

### How It Works

1. Client connects to `/ws/runs/:runId`
2. Service starts polling Prisma for run updates every 2s
3. On each poll:
   - Fetches run with steps from database
   - Compares status and step count with last known state
   - Sends WebSocket messages for any changes
4. Stops polling when run completes

### Advantages ✅

- **Simple Implementation**: Easy to understand and maintain
- **Reliable**: Works with any database without special setup
- **Debuggable**: Clear timing and state transitions
- **Database Agnostic**: No dependency on specific DB features
- **Isolated**: Each connection independently tracks its run

### Disadvantages ❌

- **Database Load**: N connections = N queries every 2s
- **Latency**: Up to 2s delay before client sees update
- **Resource Usage**: Continuous timers and database queries
- **Scaling**: More connections = proportionally more DB queries
- **Inefficiency**: Queries happen even when no changes occur

## Alternative Approaches

### 1. Event-Driven with Redis Pub/Sub 🚀

**How it works:**
- BullMQ worker publishes to Redis channel when run/step updates
- WebSocket service subscribes to Redis channels
- Messages pushed to connected clients immediately

**Implementation:**
```typescript
// In run.processor.ts
await this.redis.publish(`run:${runId}:update`, JSON.stringify({ status, steps }));

// In websocket.service.ts
this.redis.subscribe(`run:*:update`, (message) => {
  const { runId, status, steps } = JSON.parse(message);
  const ws = this.findConnectionByRunId(runId);
  if (ws) this.sendMessage(ws, { type: 'run_status', payload: { status } });
});
```

**Pros:**
- ⚡ **Instant updates**: No polling delay
- 📉 **Lower DB load**: Queries only on actual changes
- 📈 **Scales better**: Redis handles pub/sub efficiently
- 🎯 **Targeted**: Only notifies relevant connections

**Cons:**
- 🏗️ **Added dependency**: Requires Redis (already in stack for BullMQ)
- 🔧 **More complex**: Pub/sub patterns to manage
- 🔌 **Connection tracking**: Need to map runId → WebSocket instances
- 🛠️ **Debugging**: Harder to trace event flow

**Best for:** Production environments with many concurrent runs

---

### 2. PostgreSQL LISTEN/NOTIFY 📢

**How it works:**
- Database triggers emit NOTIFY events on run/step changes
- WebSocket service opens persistent PostgreSQL connection with LISTEN
- Events pushed through database layer

**Implementation:**
```sql
-- Database trigger
CREATE OR REPLACE FUNCTION notify_run_update()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('run_update', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER run_update_trigger
AFTER UPDATE ON runs
FOR EACH ROW EXECUTE FUNCTION notify_run_update();
```

```typescript
// In websocket.service.ts
const client = await this.prisma.$queryRawUnsafe('LISTEN run_update');
client.on('notification', (msg) => {
  const run = JSON.parse(msg.payload);
  // Push to connected clients
});
```

**Pros:**
- 🎯 **Database-native**: No additional infrastructure
- ⚡ **Real-time**: Instant notifications
- 📉 **Efficient**: Events only on actual changes
- 🔒 **Transactional**: Events tied to DB commits

**Cons:**
- 🔗 **Database coupling**: Requires persistent connection
- 🐘 **PostgreSQL-only**: Vendor lock-in
- 🚧 **Connection management**: Need to handle reconnects
- 📦 **Payload limits**: NOTIFY has 8KB limit
- 🔨 **Schema changes**: Requires triggers/functions

**Best for:** PostgreSQL-committed projects with moderate scale

---

### 3. Database Change Data Capture (CDC) 🔄

**How it works:**
- Use tools like Debezium, AWS DMS, or pg_logical_replication
- Stream database change log to message broker (Kafka, Kinesis)
- WebSocket service consumes stream and pushes to clients

**Pros:**
- 🏢 **Enterprise-grade**: Battle-tested for large scale
- 📊 **Audit trail**: Full change history preserved
- 🔄 **Replay**: Can replay events for debugging
- 🌐 **Distributed**: Works across multiple services

**Cons:**
- 🚀 **Overkill**: Too heavy for current needs
- 💰 **Cost**: Additional infrastructure and complexity
- 🛠️ **Setup**: Significant DevOps overhead
- 🔧 **Maintenance**: More moving parts to monitor

**Best for:** Large-scale microservices with audit requirements

---

### 4. BullMQ Event Hooks + Redis Pub/Sub 🎯

**How it works:**
- BullMQ already uses Redis for queue management
- Add event listeners to run processor jobs
- Publish to Redis channels on job lifecycle events
- WebSocket service subscribes and pushes to clients

**Implementation:**
```typescript
// In run.processor.ts
@Process('runs')
async processRun(job: Job) {
  const { runId } = job.data;
  
  // Emit status changes
  await this.redis.publish(`run:${runId}`, JSON.stringify({ 
    type: 'status', 
    payload: { status: 'processing' } 
  }));
  
  // ... execute run ...
  
  await this.redis.publish(`run:${runId}`, JSON.stringify({ 
    type: 'completed', 
    payload: { status: 'succeeded', output } 
  }));
}
```

**Pros:**
- ✅ **Leverages existing Redis**: No new dependencies
- 🎯 **Event-driven**: Updates pushed only when they happen
- 🔌 **Decoupled**: Worker and WebSocket service independent
- 📊 **Granular**: Can emit events at any step in processing

**Cons:**
- 🔄 **Double source of truth**: Redis events + database state
- 🔍 **Consistency**: Need to handle race conditions
- 🧩 **Split logic**: Update logic in multiple places

**Best for:** Leveraging existing BullMQ infrastructure

---

## Recommendation for Quik.day 🎯

### Short-term: **Keep Polling** (Current Implementation)

**Why:**
- ✅ Simple, working, debuggable
- ✅ Good enough for MVP and early users
- ✅ No additional complexity or dependencies
- ✅ Easy to optimize later without breaking changes

### Mid-term: **Upgrade to Redis Pub/Sub**

**When:** When you see these signals:
- Database query volume becomes a bottleneck
- Users report delays in seeing run updates
- Concurrent runs regularly exceed 50-100
- Monitoring shows high DB connection usage from WebSocket polling

**Migration Path:**
1. Add Redis publisher in `run.processor.ts`
2. Update WebSocketService to subscribe to Redis channels
3. Keep polling as fallback for missed events
4. Gradually reduce polling frequency (2s → 5s → 10s)
5. Eventually remove polling entirely

### Long-term: **Consider CDC for Scale**

**When:** You reach these milestones:
- 1000+ concurrent runs
- Multi-region deployment
- Need for audit/compliance tracking
- Complex event processing across services

## Implementation Plan: Redis Pub/Sub Migration

### Phase 1: Add Publishing (Non-Breaking)

```typescript
// apps/api/src/queue/run.processor.ts
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

export class RunProcessor {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    // ... existing dependencies
  ) {}

  async processRun(job: Job) {
    const { runId } = job.data;
    
    // Emit status update
    await this.emitRunEvent(runId, {
      type: 'run_status',
      payload: { status: 'processing' },
    });
    
    // ... existing processing logic ...
    
    // Emit step updates
    for (const step of steps) {
      await this.emitRunEvent(runId, {
        type: 'step_succeeded',
        payload: { tool: step.tool, ... },
      });
    }
    
    // Emit completion
    await this.emitRunEvent(runId, {
      type: 'run_completed',
      payload: { status: 'succeeded', output },
    });
  }

  private async emitRunEvent(runId: string, event: any) {
    try {
      await this.redis.publish(`run:${runId}`, JSON.stringify(event));
    } catch (error) {
      this.logger.error(`Failed to publish run event: ${error.message}`);
      // Don't fail the job if Redis pub fails
    }
  }
}
```

### Phase 2: Subscribe in WebSocket Service

```typescript
// apps/api/src/websocket/websocket.service.ts
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

export class WebSocketService {
  private subscriber: Redis;

  constructor(
    @InjectRedis() redis: Redis,
    // ... existing dependencies
  ) {
    this.subscriber = redis.duplicate();
    this.setupSubscriptions();
  }

  private setupSubscriptions() {
    this.subscriber.psubscribe('run:*', (err, count) => {
      if (err) {
        this.logger.error('Failed to subscribe to run events', err);
        return;
      }
      this.logger.log(`📡 Subscribed to ${count} Redis channels`);
    });

    this.subscriber.on('pmessage', (pattern, channel, message) => {
      const runId = channel.replace('run:', '');
      const event = JSON.parse(message);
      
      this.logger.log(`📨 Received event for runId ${runId}:`, event.type);
      
      // Find all connections for this runId
      this.connState.forEach((state, ws) => {
        if (state.runId === runId) {
          this.sendMessage(ws, event);
        }
      });
    });
  }

  // Keep polling as fallback with longer interval
  private startPollingFallback(ws: any, runId: string) {
    const timer = setInterval(() => this.pollRunUpdates(ws, runId), 10000); // 10s fallback
    const state = this.connState.get(ws);
    if (state) state.timer = timer;
  }
}
```

### Phase 3: Monitoring and Optimization

Add metrics to compare:
- Event latency (Redis pub → WebSocket send)
- Polling queries avoided
- Memory usage (connection state)
- Message throughput

### Phase 4: Remove Polling

Once Redis pub/sub proves reliable:
- Remove `setInterval` polling
- Keep connection state for routing
- Maintain database queries only for initial state on connect

## Testing Checklist ✅

- [ ] Connect to WebSocket endpoint
- [ ] Verify initial "connected" message received
- [ ] Create a run via API
- [ ] Observe status updates arriving in real-time
- [ ] Verify step messages appear as run executes
- [ ] Confirm completion message sent
- [ ] Check logs show detailed connection lifecycle
- [ ] Verify graceful disconnection cleanup
- [ ] Test multiple concurrent connections
- [ ] Validate no memory leaks over time

## Logging Reference 📝

The WebSocketService uses emoji prefixes for quick visual scanning:

- 🔌 **Initialization**: WebSocket server setup
- 🔗 **Connection**: Client connect events  
- 📨 **Messages**: Outgoing WebSocket messages
- 🔄 **Polling**: Database poll cycles
- 📊 **Statistics**: Connection/message counts
- 📝 **State**: Status/step changes
- ❌ **Errors**: Error conditions

---

**Current Status**: ✅ Polling implementation complete with comprehensive logging

**Next Steps**: Monitor production metrics and evaluate Redis pub/sub migration timeline

© 2025 Quik.day
