import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { json } from 'express';
import { WebSocketService } from './websocket/websocket.service.js';
import type { LogLevel } from '@nestjs/common';
import { FileLogger } from './logging/file-logger.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  // Load env from monorepo root if present (so API can run under turbo)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootEnv = path.resolve(__dirname, '../../../.env');
  // In dev, prefer values from .env over pre-set shell vars to avoid stale keys.
  // In production, keep default dotenv behavior (do not override process.env).
  const override = process.env.NODE_ENV !== 'production';
  if (existsSync(rootEnv)) dotenvConfig({ path: rootEnv, override });
  else dotenvConfig({ override });

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
  const logLevels = (
    process.env.LOG_LEVEL
      ? process.env.LOG_LEVEL.split(',').map((level) => level.trim())
      : ['log', 'error', 'warn']
  ) as LogLevel[];

  const fileLogger = new FileLogger('NestApplication', {
    logFilePath: process.env.LOG_FILE ?? 'logs/nest-api.log',
    levels: logLevels,
    mirrorToConsole: process.env.LOG_TO_CONSOLE !== 'false',
  });

  const app = await NestFactory.create(AppModule, { logger: fileLogger });
  app.use(json({ limit: '2mb' }));
  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  // Swagger setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Runfast API')
    .setDescription('API documentation for Runfast')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  });
  const port = Number(process.env.PORT || 3000);

  // Initialize WebSocket service for run streams
  const websocketService = app.get(WebSocketService);
  const httpServer = app.getHttpServer();
  websocketService.initialize(httpServer);

  await app.listen(port);
}
bootstrap();
