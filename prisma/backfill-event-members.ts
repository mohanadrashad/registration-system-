/**
 * One-shot backfill: grants every existing non-SUPER_ADMIN user access to
 * every existing event, using the user's current global role as their
 * per-event role.
 *
 * Run once after the `add_event_member` migration deploys, so current admins
 * keep the access they had before per-event scoping was introduced:
 *
 *   npx tsx prisma/backfill-event-members.ts
 *
 * Super admins are skipped (they bypass EventMember checks). Re-running is
 * safe — rows are upserted.
 */
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [users, events] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "SUPER_ADMIN" } },
      select: { id: true, email: true, role: true },
    }),
    prisma.event.findMany({ select: { id: true, name: true } }),
  ]);

  if (users.length === 0 || events.length === 0) {
    console.log(
      `Nothing to backfill (users=${users.length}, events=${events.length}).`
    );
    return;
  }

  let created = 0;
  let skipped = 0;
  for (const user of users) {
    for (const event of events) {
      const result = await prisma.eventMember.upsert({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
        update: {},
        create: {
          userId: user.id,
          eventId: event.id,
          role: user.role as UserRole,
        },
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
      } else {
        skipped++;
      }
    }
  }

  console.log(
    `Backfill complete: ${created} memberships created, ${skipped} already existed.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
