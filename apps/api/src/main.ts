import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';
import { PrismaService } from '@quikday/prisma';
import { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'node:url';

async function bootstrap() {
  // Load env from monorepo root if present (so API can run under turbo)
  const rootEnv = path.resolve(__dirname, '../../../.env');
  if (existsSync(rootEnv)) dotenvConfig({ path: rootEnv });
  else dotenvConfig();

  // Log masked OPENAI_API_KEY to help diagnose auth errors (do not print full key)
  try {
    const k = process.env.OPENAI_API_KEY || '';
    if (k) {
      // show first 10 chars and length
      // eslint-disable-next-line no-console
      console.log(`OPENAI_API_KEY: ${k.slice(0, 10)}... (len=${k.length})`);
    } else {
      // eslint-disable-next-line no-console
      console.log('OPENAI_API_KEY: (not set)');
    }
  } catch (e) {
    // ignore logging errors
  }

  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  app.use(json({ limit: '2mb' }));
  app.enableCors({ origin: true, credentials: true });
  const port = Number(process.env.PORT || 3000);

  // Prepare WebSocket upgrade handler for run streams
  const prisma = app.get(PrismaService);
  const server = app.getHttpServer();
  const wss = new WebSocketServer({ noServer: true });

  // Per-connection state
  const connState = new Map<any, { runId: string; timer?: ReturnType<typeof setInterval>; lastStatus?: string; lastStepCount: number }>();

  wss.on('connection', (ws: any, request: any, clientInfo: { runId: string }) => {
    const { runId } = clientInfo;
    connState.set(ws, { runId, lastStepCount: 0 });

    ws.on('close', () => {
      const st = connState.get(ws);
      if (st?.timer) clearInterval(st.timer);
      connState.delete(ws);
    });

    // Lightweight polling to push updates until terminal state
    const poll = async () => {
      try {
        // Fetch run with steps
        const run = await prisma.run.findUnique({
          where: { id: runId },
          include: { steps: true },
        });
        if (!run) return;

        const state = connState.get(ws);
        if (!state) return;

        // Emit status change
        if (run.status && state.lastStatus !== run.status) {
          ws.send(
            JSON.stringify({
              type: ['succeeded', 'completed', 'done'].includes(run.status) ? 'run_completed' : 'run_status',
              payload: { status: run.status, started_at: run.createdAt, completed_at: null },
              ts: new Date().toISOString(),
              runId,
            })
          );
          state.lastStatus = run.status as string;
        }

        // Emit any new steps
        const steps = run.steps || [];
        const newCount = steps.length;
        const prevCount = state.lastStepCount || 0;
        if (newCount > prevCount) {
          for (let i = prevCount; i < newCount; i++) {
            const s = steps[i] as any;
            ws.send(
              JSON.stringify({
                type: s.errorCode ? 'step_failed' : 'step_succeeded',
                payload: {
                  tool: s.tool,
                  action: s.action,
                  status: s.errorCode ? 'failed' : 'succeeded',
                  request: s.request,
                  response: s.response,
                  errorCode: s.errorCode,
                  errorMessage: s.errorMessage,
                  startedAt: s.startedAt,
                  completedAt: s.completedAt,
                },
                ts: new Date().toISOString(),
                runId,
              })
            );
          }
          state.lastStepCount = newCount;
        }

        // Close when terminal
        if (['succeeded', 'failed', 'completed', 'done'].includes(run.status)) {
          const st = connState.get(ws);
          if (st?.timer) clearInterval(st.timer);
          connState.delete(ws);
          // Keep connection open for client to close or further pings; do not auto-close
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[WS] Poll error:', e);
      }
    };

    // Kick off polling every 2s
    const timer = setInterval(poll, 2000);
    connState.set(ws, { ...connState.get(ws)!, timer });
    // Send initial "connected" status
    ws.send(
      JSON.stringify({
        type: 'run_status',
        payload: { status: 'connected' },
        ts: new Date().toISOString(),
        runId,
      })
    );
  });

  server.on('upgrade', (req: any, socket: any, head: any) => {
    try {
      const { pathname, searchParams } = new URL(req.url, `http://localhost:${port}`);
      // Expect pattern: /ws/runs/:runId
      if (!pathname.startsWith('/ws/runs/')) return;
      const runId = pathname.replace('/ws/runs/', '').trim();
      // Optional: validate token (for now accept any or 'dev')
      const token = searchParams.get('token');
      if (token && token !== 'dev') {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws: any) => {
        wss.emit('connection', ws, req, { runId });
      });
    } catch {
      socket.destroy();
    }
  });

  await app.listen(port);
}
bootstrap();
