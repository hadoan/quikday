import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { Server } from 'http';
import { PrismaService } from '@quikday/prisma';
import type { RunEventBus } from '@quikday/libs/pubsub/event-bus';
import { CHANNEL_WEBSOCKET } from '@quikday/libs';

interface ConnectionState {
  runId: string; // "*" for list-level stream
  unsubscribe?: () => void; // Redis unsubscribe function
  lastStatus?: string;
  lastStepCount: number;
  connectedAt: Date;
  // last sent message dedupe
  lastSentMessage?: string;
  lastSentAt?: number;
}

@Injectable()
export class WebSocketService implements OnModuleDestroy {
  private readonly logger = new Logger(WebSocketService.name);
  private wss?: any; // WebSocketServer type
  private connState = new Map<any, ConnectionState>(); // WebSocket type

  constructor(
    private readonly prisma: PrismaService,
    @Inject('RunEventBus') private eventBus: RunEventBus
  ) {}

  /**
   * Initialize WebSocket server and attach to HTTP server
   */
  initialize(httpServer: Server) {
    this.logger.log('🔌 Initializing WebSocket server');

    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws: WebSocket, request: any, clientInfo: { runId: string }) => {
      this.handleConnection(ws, clientInfo);
    });

    httpServer.on('upgrade', (req: any, socket: any, head: any) => {
      this.handleUpgrade(req, socket, head);
    });

    this.logger.log('✅ WebSocket server initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, clientInfo: { runId: string }) {
    const { runId } = clientInfo;

    this.logger.log('🔗 New WebSocket connection', {
      runId,
      timestamp: new Date().toISOString(),
    });

    // Subscribe to Pubsub events for this run. Give subscription a short
    // connection-specific label so the event bus can generate meaningful
    // handler IDs (e.g., ws-3a6b27e6-XXXX).
    const connId = randomUUID().slice(0, 8);
    const handler = async (event: any) => {
      // For list-level connections (runId === '*'), translate into runs.upsert payloads
      if (runId === '*') {
        try {
          const rid = event.runId as string;
          const run = await this.prisma.run.findUnique({
            where: { id: rid },
            include: { User: true, _count: { select: { steps: true } } as any },
          } as any);
          if (!run) return;
          const runAny: any = run;
          const projection = {
            id: run.id,
            title:
              ((run as any).goal as any)?.title ||
              (run.intent as any)?.title ||
              run.prompt?.slice(0, 80) ||
              'Run',
            status: run.status,
            createdAt: run.createdAt,
            createdBy: {
              id: run.userId,
              name: runAny.User?.displayName || runAny.User?.email || 'User',
              avatar: runAny.User?.avatar || null,
            },
            kind: 'action',
            source: ((run.config as any)?.meta?.source as string) || 'api',
            stepCount: runAny._count?.steps ?? 0,
            approvals: { required: false },
            undo: { available: false },
            lastEventAt: new Date(event.ts || Date.now()).toISOString(),
            tags: [],
          };
          this.sendMessage(ws, { type: 'runs.upsert', payload: { runId: rid, projection } });
          return;
        } catch (e) {
          this.logger.debug('Failed to build list projection', { error: (e as any)?.message });
          return;
        }
      }

      this.logger.log(`📨 Received Pubsub event for ${runId}: ${event.type}`);

      const isGlobalStream = runId === '*';
      if (!isGlobalStream && event.type !== 'chat_updated') {
        this.logger.debug('Skipping non chat_updated event for run stream', {
          runId,
          eventType: event.type,
        });
        return;
      }

      this.sendMessage(ws, event);

      const payloadAny = event.payload as any;
      if (payloadAny && ['succeeded', 'failed', 'completed', 'done'].includes(payloadAny.status)) {
        this.logger.log(`✅ Run ${runId} reached terminal state: ${payloadAny.status}`);
      }
    };

    const subscribeRunId = runId === '*' ? '*' : runId;
    const unsubscribe = this.eventBus.on(subscribeRunId, handler, CHANNEL_WEBSOCKET, {
      label: `ws-${connId}`,
    });

    // Initialize connection state
    this.connState.set(ws, {
      runId,
      lastStepCount: 0,
      connectedAt: new Date(),
      unsubscribe, // Store unsubscribe function
    });

    // Handle disconnection
    (ws as any).on('close', () => {
      this.handleDisconnection(ws);
    });

    (ws as any).on('error', (error: any) => {
      this.logger.error('❌ WebSocket error', {
        runId,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    // Send initial connection acknowledgment
    this.sendMessage(ws, {
      type: 'connection_established',
      payload: { message: runId === '*' ? 'Connected to runs stream' : 'Connected to run stream' },
      ts: new Date().toISOString(),
      runId,
    });

    this.logger.log('📨 Sent initial connection status', { runId });

    // Removed legacy run_snapshot emit; clients hydrate state from chat items instead.
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(ws: WebSocket) {
    const state = this.connState.get(ws);

    if (state) {
      const duration = Date.now() - state.connectedAt.getTime();

      this.logger.log('🔌 WebSocket disconnected', {
        runId: state.runId,
        duration: `${(duration / 1000).toFixed(2)}s`,
        lastStatus: state.lastStatus,
        timestamp: new Date().toISOString(),
      });

      // Unsubscribe from Redis events
      if (state.unsubscribe) {
        state.unsubscribe();
      }
    }

    this.connState.delete(ws);
  }

  /**
   * Send message to WebSocket client with error handling
   */
  private sendMessage(ws: WebSocket, message: any) {
    console.log(
      '-------------------------------- Sending WebSocket message -----------------------------'
    );
    this.logger.log('📤 Sending WebSocket message', {
      runId: this.connState.get(ws)?.runId,
      messageType: message.type,
      timestamp: new Date().toISOString(),
      message
    });

    try {
      const state = this.connState.get(ws);
      const payloadStr = JSON.stringify(message);

      // Build a normalized fingerprint for dedupe by removing common transient
      // fields that differ across identical logical events (id, ts, origin).
      const fingerprintObj = state
        ? ((): any => {
            try {
              const c = JSON.parse(payloadStr);
              // Top-level transient fields
              delete c.id;
              delete c.ts;
              delete c.origin;
              // Remove transient fields from payload if present
              if (c.payload && typeof c.payload === 'object') {
                delete c.payload.id;
                delete c.payload.ts;
                delete c.payload.origin;
              }
              return c;
            } catch {
              return null;
            }
          })()
        : null;

      const fingerprintStr = fingerprintObj ? JSON.stringify(fingerprintObj) : null;

      // Simple per-connection dedupe: skip messages with identical fingerprint sent within 500ms
      if (state && fingerprintStr) {
        const now = Date.now();
        if (
          state.lastSentMessage === fingerprintStr &&
          state.lastSentAt &&
          now - state.lastSentAt < 500
        ) {
          this.logger.debug('⏱️ Deduped websocket message (recent fingerprint)', {
            runId: state.runId,
            messageType: message.type,
          });
          return;
        }
        state.lastSentMessage = fingerprintStr;
        state.lastSentAt = now;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payloadStr);
      } else {
        this.logger.warn('⚠️ Cannot send message, WebSocket not open', {
          runId: state?.runId,
          readyState: ws.readyState,
          messageType: message.type,
        });
      }
    } catch (error) {
      const state = this.connState.get(ws);
      this.logger.error('❌ Failed to send WebSocket message', {
        runId: state?.runId,
        error: error instanceof Error ? error.message : 'Unknown error',
        messageType: message.type,
      });
    }
  }

  /**
   * Handle WebSocket upgrade requests
   */
  private handleUpgrade(req: any, socket: any, head: any) {
    try {
      const url = new URL(req.url, `http://localhost:3000`);
      const { pathname, searchParams } = url;

      // Supported patterns:
      // - /ws/runs/:runId
      // - /ws/runs-stream (list-level stream)
      const isStreamAll = pathname === '/ws/runs-stream';
      const isRunPath = pathname.startsWith('/ws/runs/');
      if (!isStreamAll && !isRunPath) {
        this.logger.warn('⚠️ Invalid WebSocket path', {
          pathname,
          timestamp: new Date().toISOString(),
        });
        socket.destroy();
        return;
      }

      const runId = isStreamAll ? '*' : pathname.replace('/ws/runs/', '').trim();

      if (!runId) {
        this.logger.warn('⚠️ Missing runId in WebSocket path', {
          pathname,
          timestamp: new Date().toISOString(),
        });
        socket.destroy();
        return;
      }

      // Optional: validate token (for now accept any or 'dev')
      const token = searchParams.get('token');
      if (token && token !== 'dev') {
        this.logger.warn('⚠️ Invalid WebSocket token', {
          runId,
          timestamp: new Date().toISOString(),
        });
        socket.destroy();
        return;
      }

      this.logger.log('✅ WebSocket upgrade successful', {
        runId,
        token: token || 'none',
        timestamp: new Date().toISOString(),
      });

      this.wss?.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        this.wss?.emit('connection', ws, req, { runId });
      });
    } catch (error) {
      this.logger.error('❌ WebSocket upgrade error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      socket.destroy();
    }
  }

  // /**
  //  * Get connection statistics
  //  */
  // getStats() {
  //   const redisStats = this.redisPubSub.getStats();

  //   return {
  //     activeConnections: this.connState.size,
  //     redis: redisStats,
  //     connections: Array.from(this.connState.values()).map((state) => ({
  //       runId: state.runId,
  //       duration: Date.now() - state.connectedAt.getTime(),
  //       lastStatus: state.lastStatus,
  //     })),
  //   };
  // }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy() {
    this.logger.log('🔌 Shutting down WebSocket server');

    // Unsubscribe all connections
    for (const [ws, state] of this.connState.entries()) {
      if (state.unsubscribe) {
        state.unsubscribe();
      }
      ws.close();
    }

    this.connState.clear();
    this.wss?.close();

    this.logger.log('✅ WebSocket server shutdown complete');
  }
}
