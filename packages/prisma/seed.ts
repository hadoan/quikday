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
      `SELECT setval(pg_get_serial_sequence('"Team"','id'), COALESCE((SELECT MAX(id) FROM "Team"), 0) + 1, false);`,
    );
    console.log('🔧 Synchronized Team id sequence');
  } catch (err) {
    console.warn(
      '⚠️  Could not adjust Team id sequence (likely non-Postgres or permission issue).',
    );
  }

  // Reset and seed default templates (full regen each run)
  const defaults: Array<{
    kind: string;
    label: string;
    sampleText: string;
    locale: 'en' | 'de';
  }> = [
    // No-Reply Sweep (14d)
    {
      kind: 'no_reply_sweep',
      label: 'No-Reply Sweep (14d)',
      sampleText:
        'Please sweep my no-reply threads from the last {days=14} days and create polite follow-up drafts.',
      locale: 'en',
    },
    // Quick Demo Scheduler (3 slots)
    {
      kind: 'quick_demo_scheduler',
      label: 'Quick Demo Scheduler (3 slots)',
      sampleText:
        'Propose {count=3} meeting slots next week for {contact=email} and place tentative holds.',
      locale: 'en',
    },
    // Daily Founder Digest (08:45)
    {
      kind: 'daily_founder_digest',
      label: 'Daily Founder Digest (08:45)',
      sampleText:
        'Set up a daily morning digest at {time=08:45} with today’s meetings, hot emails, and pending follow-ups.',
      locale: 'en',
    },
    // Pre-Meeting Prep
    {
      kind: 'pre_meeting_prep',
      label: 'Pre-Meeting Prep',
      sampleText:
        'Prepare a one-pager for my {when=date/time or title} meeting with {name/company} using recent email context.',
      locale: 'en',
    },
    // After-Meeting Recap + Reminder
    {
      kind: 'after_meeting_recap',
      label: 'After-Meeting Recap + Reminder',
      sampleText:
        'Draft a recap for the last meeting with {contact=email} and set a follow-up reminder in {followup=3d}.',
      locale: 'en',
    },
    // 10-Minute Inbox Triage
    {
      kind: 'inbox_triage',
      label: '10-Minute Inbox Triage',
      sampleText:
        'Give me a {minutes=10}-minute triage of priority emails and create quick-reply drafts (max {max=8}).',
      locale: 'en',
    },
    // Smart RSVP + Buffer
    {
      kind: 'smart_rsvp',
      label: 'Smart RSVP + Buffer',
      sampleText:
        'RSVP {yes|no=yes} to {eventRef=select} and add {buffer=30m} buffers before and after.',
      locale: 'en',
    },
    // Out-of-Office
    {
      kind: 'out_of_office',
      label: 'Out-of-Office',
      sampleText: 'Set an out-of-office from {start=date} to {end=date} with this message: {msg=text}.',
      locale: 'en',
    },
    // Slot Picker Reply (optional)
    {
      kind: 'slot_picker_reply',
      label: 'Slot Picker Reply',
      sampleText:
        'Offer {count=3} morning slots to {contact=email} directly in my reply.',
      locale: 'en',
    },
    // Weekly Calendar Hygiene (optional)
    {
      kind: 'weekly_calendar_hygiene',
      label: 'Weekly Calendar Hygiene',
      sampleText:
        "Clean up next week’s calendar: resolve conflicts, add focus blocks, and email me a summary.",
      locale: 'en',
    },
  ];

  // Remove all templates and regenerate from the defaults list
  const del = await prisma.template.deleteMany({});
  console.log(`🧹 Removed ${del.count} existing template(s).`);

  // Bulk insert defaults
  const createRes = await prisma.template.createMany({
    data: defaults.map((t) => ({
      kind: t.kind,
      label: t.label,
      sampleText: t.sampleText,
      locale: t.locale,
      isDefault: true,
      isUserCustom: false,
      createdBy: 'seed',
    })),
    skipDuplicates: false,
  });
  console.log(`🧩 Inserted ${createRes.count} default template(s).`);

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
