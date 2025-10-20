import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';
import { WebSocketService } from './websocket/websocket.service';

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

  // Configure logger levels from environment
  const logLevels = process.env.LOG_LEVEL
    ? (process.env.LOG_LEVEL.split(',').map((level) => level.trim()) as any[])
    : ['log', 'error', 'warn'];

  const app = await NestFactory.create(AppModule, { logger: logLevels });
  app.use(json({ limit: '2mb' }));
  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  const port = Number(process.env.PORT || 3000);

  // Initialize WebSocket service for run streams
  const websocketService = app.get(WebSocketService);
  const httpServer = app.getHttpServer();
  websocketService.initialize(httpServer);

  await app.listen(port);
}
bootstrap();
