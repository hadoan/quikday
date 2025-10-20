/*
  Minimal development seed

  - Creates a dev user (sub: 'dev-user')
  - Ensures a Team with id=1 exists (name: 'Dev Team')
  - Adds the dev user as owner of Team 1

  Usage:
    pnpm db:push   # ensure schema is applied
    pnpm seed      # runs this script via ts-node
*/

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Running seed...');

  // Upsert dev user
  const user = await prisma.user.upsert({
    where: { sub: 'dev-user' },
    update: {},
    create: {
      sub: 'dev-user',
      email: 'dev@example.com',
      displayName: 'Dev User',
    },
  });
  console.log('👤 Upserted dev user:', { id: user.id, email: user.email });

  // Ensure Team id=1 exists
  // Note: We explicitly set id=1 for local convenience since the web app defaults to teamId=1.
  // In Postgres, inserting explicit ids on an autoincrement column is allowed, but it does not
  // advance the sequence automatically. We fix the sequence after creation below.
  const team = await prisma.team.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Dev Team',
    },
  });
  console.log('🏢 Upserted team:', { id: team.id, name: team.name });

  // Add membership (owner)
  await prisma.teamMember.upsert({
    where: {
      teamId_userId: { teamId: team.id, userId: user.id },
    },
    update: {},
    create: {
      teamId: team.id,
      userId: user.id,
      role: 'owner',
    },
  });
  console.log('👥 Ensured membership: user -> team as owner');

  // Fix Postgres sequence for Team.id so future inserts without explicit id work
  // (no-op on other databases or if privileges are insufficient)
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"Team"','id'), COALESCE((SELECT MAX(id) FROM "Team"), 0) + 1, false);`
    );
    console.log('🔧 Synchronized Team id sequence');
  } catch (err) {
    console.warn('⚠️  Could not adjust Team id sequence (likely non-Postgres or permission issue).');
  }

  console.log('✅ Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

