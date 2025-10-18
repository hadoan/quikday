import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Attempt to load a root-level .env so DATABASE_URL (and other vars) are available
function loadEnvFromRoot(): void {
  // If already set, nothing to do
  if (process.env.DATABASE_URL) return;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    // when running from compiled package, __dirname may be in dist; try walking up
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  // Try using dotenv if it's available in the consuming project
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const dotenv = require('dotenv');
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        return;
      }
    }
  } catch (e) {
    // dotenv not available — fall through to manual parse
  }

  // Manual, minimal .env parser fallback (no new dependencies)
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          process.env[key] = val;
        }
      }
      return;
    } catch (err) {
      // ignore parse/read errors and try next candidate
    }
  }
}

loadEnvFromRoot();

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
