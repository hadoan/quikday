export { default as prisma } from './prisma-client.js';
export { PrismaModule, PrismaService } from './nest-prisma/index.js';
export * from './selects/index.js';
export * from './enums/index.js';

// Re-export Prisma namespace and PrismaClient for type safety
export { Prisma, PrismaClient } from '@prisma/client';
