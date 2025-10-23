# Redis Pub/Sub → WebSocket Streaming

_(Architecture & Implementation Guide — EN & DE)_

---

## What this doc covers

- Why we use Redis Pub/Sub for live run updates
- End-to-end data flow from the Agent/Processor → Redis → WS Gateway → Browser
- Event envelope & schema
- Origin/dedupe safeguards (no echo loops)
- WebSocket lifecycle & hardening (heartbeat, backpressure)
- Configuration, observability, troubleshooting
- Scale & durability options (Redis Streams snapshot/replay)

---

## 1) High-level overview

### EN

We broadcast **run lifecycle events** (status, planning, steps, completion) via **Redis Pub/Sub** on channels named `run:<runId>`.
The **WebSocket gateway** subscribes to the same channel and forwards events to the connected browser client.

### DE

Wir senden **Run-Lebenszyklus-Events** (Status, Planung, Steps, Abschluss) über **Redis Pub/Sub** auf Kanälen `run:<runId>`.
Das **WebSocket-Gateway** abonniert denselben Kanal und leitet Events an den Browser weiter.

```
+-------------+        publish        +-----------+       push        +-----------+
| Agent/Exec  |  ───────────────────► |  Redis    |  ───────────────► | WS Server |
| (Processor) |                       |  Pub/Sub  |                   | (Gateway) |
+-------------+        subscribe      +-----------+      send()       +-----------+
                                             ▲                             │
                                             └────────── client WS ◄───────┘
```

---

## 2) Event envelope

**TypeScript**

```ts
// libs/redis/RunEvent.ts
export type RunEventType = string;

export interface RunEvent {
  id: string; // uuid v7 (or ulid) - unique per event (dedupe key)
  origin: string; // e.g. "runs-api" | "ws-gateway" | "langgraph"
  type: RunEventType; // e.g. "run_status" | "plan.ready" | "tool.succeeded" | ...
  runId: string; // channel discriminator: run:<runId>
  ts: string; // ISO timestamp
  payload?: unknown; // free-form payload (status, step result, etc.)
}
```

**Common event types**

- `run_status`: `{ status: "running" | "planning" | "executing" | "awaiting_approval" | "failed" | "done" }`
- `plan.ready`: `{ plan: Step[], diff?: any }`
- `step_started`: `{ tool, action, request }`
- `step_succeeded`: `{ tool, action, response, ms }`
- `step_failed`: `{ tool, error: { code, message } }`
- `run_completed`: `{ status: "done", output }`
- `approval.awaiting`: `{ approvalId, ... }`

> Keep terminal statuses normalized: `done | failed | completed | succeeded` → treat consistently in UI.

---

## 3) Publishing events (Processor / Agent)

**Channel**: `run:<runId>`
**Envelope**: include `id`, `origin`, `ts` for reliability and loops prevention.

```ts
await redis.publish(\`run:\${runId}\`, JSON.stringify({
  id: uuidv7(),
  origin: process.env.SERVICE_NAME ?? 'runs-api',
  type: 'run_status',
  runId,
  ts: new Date().toISOString(),
  payload: { status: 'running' },
}));
```

**Best practices**

- Always set `origin`.
- Generate a unique `id` per event (dedupe).
- Keep payloads reasonably small; large blobs → store elsewhere and reference an ID.

---

## 4) Subscribing & forwarding (WS Gateway)

### Subscription

- Pattern-subscribe to `run:*`.
- Validate JSON shape (optional: Zod).
- **Dedupe** by `id`.
- **Ignore self-origin** is configurable (see below).

```ts
subscriber.psubscribe('run:*');
subscriber.on('pmessage', (_, channel, raw) => {
  const evt: RunEvent = JSON.parse(raw);
  if (!evt.id || !evt.type || !evt.runId) return; // schema sanity
  if (dedupe.has(evt.id)) return;
  dedupe.add(evt.id); // 10s TTL LRU
  if (IGNORE_SELF && evt.origin === SERVICE_NAME) return;

  // Fan out to all WS handlers for this run
  for (const h of handlers.get(channel) ?? []) h(evt);
});
```

### Forward to WS client

- Serialize once, send via `ws.send()`.
- Add backpressure guard using `ws.bufferedAmount`.
- Optionally rate-limit to prevent flooding.

```ts
if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX_BUFFERED) {
  ws.send(JSON.stringify(evt));
}
```

---

## 5) Self-origin & dedupe

### Why

- If publisher and subscriber run **in the same process**, ignoring own origin means **you won’t see any events**.
- If they run in **separate services**, ignoring own origin helps avoid echo loops.

### Config

- `SERVICE_NAME=runs-api | ws-gateway | langgraph`
- `REDIS_IGNORE_SELF_ORIGIN=true|false`

**Rule of thumb**

- Monolith/dev (pub + sub same app): `REDIS_IGNORE_SELF_ORIGIN=false`
- Split services (API vs WS): `true` (default), and **never** republish received events.

**Dedupe**

- Keep an LRU cache by `event.id` (e.g., 10s TTL) to drop accidental duplicates.

---

## 6) WebSocket lifecycle hardening

### Heartbeat (ping/pong)

Detect dead connections and free memory.

```ts
const INTERVAL = 30_000;
ws.on('pong', () => ((ws as any).isAlive = true));
setInterval(() => {
  if (!(ws as any).isAlive) return ws.terminate();
  (ws as any).isAlive = false;
  ws.ping();
}, INTERVAL);
```

### Backpressure & rate-limit

Prevent OOM when producers are faster than the client.

- Drop or coalesce when `ws.bufferedAmount > 1MB`.
- Limit to N messages per second per socket (e.g., 50).

### Initial snapshot

Pub/Sub has no history. Cache last event per run in Redis and send it on connect:

- `SET run:<runId>:snapshot <event> EX 3600`
- On WS connect: `GET` and `send()` snapshot before streaming live events.

---

## 7) Security

- **Auth on upgrade**: Require JWT (query `?token=...`) and verify claims include access to the `runId`.
- **Authorization**: Only allow users with team/run access.
- **Input validation**: Zod (or similar) for incoming Pub/Sub messages.
- **No republish in handlers**: WS forwards to clients only; never publish back to Redis.
- **CORS/CSRF**: Not applicable to WS frames, but secure your upgrade path and tokens.

---

## 8) Configuration

| Variable                   | Purpose                             | Example                  |
| -------------------------- | ----------------------------------- | ------------------------ |
| `REDIS_URL`                | Redis connection string             | `redis://localhost:6379` |
| `SERVICE_NAME`             | Origin tag for events               | `runs-api`               |
| `REDIS_IGNORE_SELF_ORIGIN` | Ignore events we produced ourselves | `false` (mono) / `true`  |
| `WS_JWT_SECRET`            | Verify WS tokens on upgrade         | `supersecret`            |

---

## 9) Observability

- **Logs**:
  - Pub/Sub: “Published/Received `<type>` on `run:<runId>`”
  - WS: connection established/closed; message send attempts with backpressure info.
- **Stats endpoint** (WS): number of active connections, avg `bufferedAmount`, last status per run.
- **Telemetry**: `step_succeeded/failed`, `run_completed`, approval waits.

---

## 10) Troubleshooting

**Symptom**: Only “connection_established”, no further events.  
**Cause**: Self-origin filter dropping local events.  
**Fix**: Set `REDIS_IGNORE_SELF_ORIGIN=false` (or split services & keep `true`).

**Symptom**: High memory / process crash.  
**Cause**: Backpressure; client is slow.  
**Fix**: Add buffer guard & rate-limit; consider coalescing events (e.g., only last status in a time window).

**Symptom**: Client misses initial state.  
**Cause**: Pub/Sub has no history.  
**Fix**: Send **snapshot** on connect (or adopt Redis Streams for replay).

**Symptom**: Duplicate UI updates.  
**Cause**: Double publication.  
**Fix**: Dedupe by `event.id` and ensure each code path publishes once.

---

## 11) Scaling & Durability

- **Horizontal scale**: Multiple WS nodes can subscribe to the same patterns; each holds its own client connections.
- **Durable history** (optional): dual-write to **Redis Streams**.
  - Live fan-out via Pub/Sub (low latency)
  - Replay/“last known” via Streams (e.g., `XREVRANGE stream:run:<id> + - COUNT 1` on connect)
- **Sharding**: Use Redis Cluster if channels/keys grow large.
- **Backfill**: For very large payloads, store artifact in object storage and send references (URLs/ids) in payload.

---

## 12) Minimal code recap — How WebSocket is subscribed

```ts
// WS: subscribe for this run
const unsubscribe = redisPubSub.onRunEvent(runId, (evt) => sendMessage(ws, evt));

// Redis: subscribe & route to the correct WS handlers
subscriber.psubscribe('run:*');
subscriber.on('pmessage', (_, channel, raw) => {
  const evt = JSON.parse(raw) as RunEvent;
  for (const h of eventHandlers.get(channel) ?? []) h(evt);
});

// Cleanup on disconnect
ws.on('close', () => unsubscribe());
```
