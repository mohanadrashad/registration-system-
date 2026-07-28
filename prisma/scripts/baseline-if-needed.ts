/**
 * Runs before `prisma migrate deploy` during Vercel builds (see the
 * vercel-build script). Handles the one-time adoption of the migrations
 * workflow on databases that were previously managed with `prisma db push`:
 *
 *   - Database has app tables but NO _prisma_migrations table
 *       → it predates migrations. Mark the 0_init baseline as applied
 *         (bookkeeping only — inserts one row, never touches app tables)
 *         so `migrate deploy` doesn't try to re-create existing tables.
 *   - Database already has _prisma_migrations
 *       → already adopted; do nothing.
 *   - Database is completely empty (fresh/disaster-recovery)
 *       → do nothing; `migrate deploy` will apply 0_init and build the
 *         whole schema from scratch, which is exactly right.
 *
 * Idempotent and safe to run on every deploy. Any unexpected failure exits
 * non-zero, which fails the build before `migrate deploy` runs.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<
    { hasMigrations: boolean; hasApp: boolean }[]
  >`SELECT
      to_regclass('public._prisma_migrations') IS NOT NULL AS "hasMigrations",
      to_regclass('public."Event"') IS NOT NULL AS "hasApp"`;
  const { hasMigrations, hasApp } = rows[0];

  if (hasMigrations) {
    console.log("[baseline] migrations table present — nothing to do.");
    return;
  }
  if (!hasApp) {
    console.log(
      "[baseline] empty database — migrate deploy will build it from 0_init."
    );
    return;
  }

  console.log(
    "[baseline] existing db-push-managed database detected — marking 0_init as applied."
  );
  execSync("npx prisma migrate resolve --applied 0_init", {
    stdio: "inherit",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
