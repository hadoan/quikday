import { PrismaClient } from '@prisma/client';

const env = process.env.DATABASE_URL;

let _defaultClient: PrismaClient;

if (!env) {
  // Fail-fast proxy that throws when accessed
  const handler: ProxyHandler<any> = {
    get() {
      throw new Error('DATABASE_URL is not set. Prisma client cannot be used.');
    },
    apply() {
      throw new Error('DATABASE_URL is not set. Prisma client cannot be used.');
    },
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  _defaultClient = new Proxy({}, handler) as PrismaClient;
} else {
  _defaultClient = new PrismaClient();
}

export default _defaultClient;
