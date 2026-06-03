/**
 * READ-ONLY pre-flight for migrating the branding API from the global
 * `authorize("editor")` to per-event `authorizeEvent({ role: "editor" })`.
 *
 * Today `authorize("editor")` lets ANY global EDITOR/MANAGER edit branding on
 * ANY event. `authorizeEvent` additionally requires per-event editor-tier
 * membership (SUPER_ADMIN bypasses entirely). So the ONLY accounts whose
 * access could change are non-SUPER_ADMIN global EDITOR/MANAGER users.
 *
 * Mirrors the auth-posture sweep's pre-flight (PR #34): if zero such users
 * exist, the migration changes nobody's access and is safe to ship.
 *
 * Run against PRODUCTION (read-only — no writes):
 *   npx dotenvx run -f .env.prod.local -- npx tsx prisma/scripts/preflight-branding-auth.ts
 *
 * PASS → 0 affected users → migrate.
 * STOP → >0 → report the accounts; do NOT migrate without a human decision.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const byRole = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });
  console.log("Users by global role:");
  for (const r of byRole.sort((a, b) => a.role.localeCompare(b.role))) {
    console.log(`  ${r.role.padEnd(12)} ${r._count._all}`);
  }

  // Affected = non-SUPER_ADMIN global editor-tier accounts.
  const affected = await prisma.user.findMany({
    where: { role: { in: ["EDITOR", "MANAGER"] } },
    select: { id: true, email: true, role: true },
  });

  console.log(
    `\nNon-SUPER_ADMIN global EDITOR/MANAGER users: ${affected.length}`
  );

  if (affected.length > 0) {
    const totalEvents = await prisma.event.count();
    for (const u of affected) {
      const editorMemberships = await prisma.eventMember.count({
        where: { userId: u.id, role: { in: ["EDITOR", "MANAGER"] } },
      });
      console.log(
        `  ${u.role.padEnd(8)} ${u.email}  — editor on ${editorMemberships}/${totalEvents} events; would lose branding-edit on ${
          totalEvents - editorMemberships
        }`
      );
    }
  }

  console.log(
    affected.length === 0
      ? "\nRESULT: PASS — migration changes nobody's access. Safe to migrate."
      : "\nRESULT: STOP — affected user(s) exist. Do NOT migrate without a human decision."
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
