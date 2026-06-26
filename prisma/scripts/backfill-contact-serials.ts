/**
 * Backfill: assign Contact.serialNumber to existing rows.
 *
 * The per-event attendee number (Contact.serialNumber) is assigned at
 * creation time going forward, but rows created before the column existed
 * have NULL. This script numbers them per event in createdAt order (oldest =
 * #1), continuing past any contacts that already have a number.
 *
 * Idempotent: a second run finds zero NULL rows and reports 0 assigned. Safe
 * to re-run. Reads DATABASE_URL from the environment, so point it at the
 * target DB (load the appropriate .env / set DATABASE_URL) before running.
 * Best run during low write traffic so a concurrent registration doesn't grab
 * a number mid-backfill (the @@unique([eventId, serialNumber]) constraint is
 * the backstop — a clash would throw rather than silently double-assign).
 *
 * Run with: npx tsx prisma/scripts/backfill-contact-serials.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Backfilling Contact.serialNumber per event...\n");

  const events = await prisma.event.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  let totalAssigned = 0;

  for (const ev of events) {
    // Continue past any contacts that already carry a number (new rows
    // created after the column shipped, or a prior partial run).
    const agg = await prisma.contact.aggregate({
      where: { eventId: ev.id },
      _max: { serialNumber: true },
    });
    let next = (agg._max.serialNumber ?? 0) + 1;

    const nulls = await prisma.contact.findMany({
      where: { eventId: ev.id, serialNumber: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    for (const c of nulls) {
      await prisma.contact.update({
        where: { id: c.id },
        data: { serialNumber: next },
      });
      next++;
    }

    if (nulls.length > 0) {
      totalAssigned += nulls.length;
      console.log(
        `  ${ev.name}: assigned ${nulls.length} (now numbered up to #${next - 1})`
      );
    }
  }

  console.log(`\n--- Backfill Complete ---`);
  console.log(`  Events scanned: ${events.length}`);
  console.log(`  Contacts numbered this run: ${totalAssigned}`);

  const remaining = await prisma.contact.count({ where: { serialNumber: null } });
  console.log(`  Contacts still without a number: ${remaining}`);
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
