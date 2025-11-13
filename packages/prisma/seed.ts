/*
  Minimal development seed

  - Creates a dev user (sub: 'dev-user')
  - Ensures a Team with id=1 exists (name: 'Dev Team')
  - Adds the dev user as owner of Team 1

  Usage:
    pnpm db:push   # ensure schema is applied
    pnpm seed      # runs this script via ts-node
*/

import { PrismaClient, RunStatus } from '@prisma/client';
import { templateData } from './template-data';

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
      `SELECT setval(pg_get_serial_sequence('"Team"','id'), COALESCE((SELECT MAX(id) FROM "Team"), 0) + 1, false);`,
    );
    console.log('🔧 Synchronized Team id sequence');
  } catch (err) {
    console.warn(
      '⚠️  Could not adjust Team id sequence (likely non-Postgres or permission issue).',
    );
  }

  // Reset and seed default templates (full regen each run)
  const defaults = templateData;

  // Remove all templates and regenerate from the defaults list
  const del = await prisma.template.deleteMany({});
  console.log(`🧹 Removed ${del.count} existing template(s).`);

  // Bulk insert defaults
  const createRes = await prisma.template.createMany({
    data: defaults.map((t) => ({
      kind: t.kind,
      label: t.label,
      sampleText: t.sampleText,
      icon: t.icon,
      category: t.category,
      locale: t.locale,
      isDefault: true,
      isUserCustom: false,
      createdBy: 'seed',
    })),
    skipDuplicates: false,
  });
  console.log(`🧩 Inserted ${createRes.count} default template(s).`);

  console.log('✅ Seed completed successfully');

  // ---------------------------------------------------------------------------
  // Seed sample runs for preview (if none exist)
  // ---------------------------------------------------------------------------
  const existingRuns = await prisma.run.count();
  if (existingRuns === 0) {
    console.log('🧪 Seeding sample runs...');
    const statuses: RunStatus[] = [
      RunStatus.QUEUED,
      RunStatus.PLANNING,
      RunStatus.AWAITING_APPROVAL,
      RunStatus.APPROVED,
      RunStatus.RUNNING,
      RunStatus.SUCCEEDED,
      RunStatus.FAILED,
      RunStatus.CANCELED,
      RunStatus.UNDO_PENDING,
      RunStatus.UNDONE,
      RunStatus.UNDO_FAILED,
    ];
    const toCreate = Array.from({ length: 12 }).map((_, i) => ({
      prompt: `Sample run #${i + 1}`,
      mode: i % 3 === 0 ? 'plan' : 'auto',
      status: statuses[i % statuses.length],
      teamId: team.id,
      userId: user.id,
      intent: { title: `Demo ${i + 1}` } as any,
      config: { meta: { source: i % 2 === 0 ? 'chat' : 'api' } } as any,
      createdAt: new Date(Date.now() - i * 3600_000),
      updatedAt: new Date(Date.now() - i * 3300_000),
    }));
    for (const data of toCreate) {
      const r = await prisma.run.create({ data });
      const steps = Math.floor(Math.random() * 3);
      for (let s = 0; s < steps; s++) {
        await prisma.step.create({
          data: {
            runId: r.id,
            tool: 'demo.tool',
            action: 'noop',
            request: {},
            response: {},
          },
        });
      }
    }
    console.log('✅ Sample runs created');
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
