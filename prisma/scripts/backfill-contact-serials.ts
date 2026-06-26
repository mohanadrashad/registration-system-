/**
 * Backfill: assign Contact.serialNumber to existing rows.
 *
 * The per-event attendee number (Contact.serialNumber) is assigned at
 * creation time going forward, but rows created before the column existed
 * have NULL. This script numbers them per event in createdAt order (oldest =
 * #1), continuing past any contacts that already have a number.
 *
 * Done as a SINGLE bulk UPDATE (window function) so it finishes in seconds
 * even on large events — not one round-trip per contact.
 *
 * Idempotent: only touches rows where serialNumber IS NULL, and continues
 * from each event's current max, so a second run (or a re-run after an
 * interrupted earlier attempt) numbers exactly the remaining rows with no
 * gaps or collisions. Reads DATABASE_URL from the environment, so point it at
 * the target DB before running.
 *
 * Run with: npx tsx prisma/scripts/backfill-contact-serials.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Backfilling Contact.serialNumber (bulk, per event)...\n");

  // One statement: for every contact missing a number, assign
  // (per-event createdAt rank) + (that event's current max number). Events
  // already fully numbered have no NULL rows and are untouched.
  const numbered = await prisma.$executeRaw`
    WITH offsets AS (
      SELECT "eventId", COALESCE(MAX("serialNumber"), 0) AS base
      FROM "Contact"
      GROUP BY "eventId"
    ),
    ranked AS (
      SELECT
        c.id,
        ROW_NUMBER() OVER (
          PARTITION BY c."eventId"
          ORDER BY c."createdAt" ASC, c.id ASC
        ) + o.base AS rn
      FROM "Contact" c
      JOIN offsets o ON o."eventId" = c."eventId"
      WHERE c."serialNumber" IS NULL
    )
    UPDATE "Contact"
    SET "serialNumber" = ranked.rn
    FROM ranked
    WHERE "Contact".id = ranked.id
  `;

  console.log(`--- Backfill Complete ---`);
  console.log(`  Contacts numbered this run: ${numbered}`);

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
