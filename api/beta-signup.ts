// Vercel Serverless Function to save beta signups using raw SQL (node-postgres)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgpool: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__pgpool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    // Enable SSL for hosted Postgres (required for most cloud providers)
    // Disable only for local dev by setting PGSSL=0
    const sslEnabled = process.env.PGSSL !== '0';
    const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined;
    global.__pgpool = new Pool({ connectionString, ssl });
  }
  return global.__pgpool as Pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, role, teamSize, useCase } = (req.body as any) || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email required' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const pool = getPool();
    const text =
      'INSERT INTO "Waitlist" ("email","role","teamSize","useCase") VALUES ($1,$2,$3,$4) ' +
      'ON CONFLICT ("email") DO UPDATE SET "role" = EXCLUDED."role", "teamSize" = EXCLUDED."teamSize", "useCase" = EXCLUDED."useCase"';
    const values = [
      normalizedEmail,
      role ?? null,
      teamSize ?? null,
      useCase ?? null,
    ];
    await pool.query(text, values);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('beta-signup error', err);
    return res.status(500).json({ error: 'Failed to save' });
  }
}
