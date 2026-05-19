/**
 * Data fix: normalize empty-string Contact.category to NULL.
 *
 * Stage 1 of the category-based phase logic feature constrains
 * Contact.category to values in Event.categories (or NULL). An
 * empty string is neither NULL nor a valid category, so it must be
 * collapsed to NULL before enforcement is meaningful.
 *
 * Idempotent: a second run matches zero rows and reports 0 updated.
 * Reads DATABASE_URL from the environment, so point it at staging or
 * production by loading the appropriate .env before running.
 *
 * Run with: npx tsx prisma/scripts/normalize-empty-category.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting data fix: normalize empty Contact.category to NULL...\n");

  // Count first so the log is meaningful even on a no-op second run.
  const toFix = await prisma.contact.count({ where: { category: "" } });
  console.log(`Found ${toFix} contact(s) with category = '' (empty string).`);

  if (toFix === 0) {
    console.log("Nothing to do. Already normalized (or never dirty).");
    return;
  }

  const result = await prisma.contact.updateMany({
    where: { category: "" },
    data: { category: null },
  });

  console.log(`\n--- Data Fix Complete ---`);
  console.log(`  Rows updated: ${result.count}`);

  // Verify nothing remains (guards against a partial/raced update).
  const remaining = await prisma.contact.count({ where: { category: "" } });
  console.log(`  Remaining category = '' rows: ${remaining}`);
  if (remaining !== 0) {
    throw new Error(
      `Expected 0 empty-string categories after fix, found ${remaining}.`
    );
  }
}

main()
  .catch((e) => {
    console.error("Data fix failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
