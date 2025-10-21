import type { LoggerService } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { GmailManagerConfig } from './GmailManagerConfig.js';

export interface GmailManagerOptions {
  prisma?: PrismaClient;
  logger?: LoggerService;
  config?: GmailManagerConfig;
}

