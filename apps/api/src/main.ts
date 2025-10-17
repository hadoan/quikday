import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  // Load env from monorepo root if present (so API can run under turbo)
  const rootEnv = path.resolve(__dirname, '../../../.env');
  if (existsSync(rootEnv)) dotenvConfig({ path: rootEnv });
  else dotenvConfig();

  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  app.use(json({ limit: '2mb' }));
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
