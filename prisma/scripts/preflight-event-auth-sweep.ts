/**
 * READ-ONLY pre-flight for the event API auth-posture sweep — migrating the
 * remaining `[eventId]` handlers from the global `authorize()` helper to
 * per-event `authorizeEvent()`.
 *
 * Today `authorize("editor")` / `authorize("manager")` let ANY global
 * EDITOR/MANAGER mutate ANY event. `authorizeEvent` additionally requires
 * per-event editor/manager-tier membership (SUPER_ADMIN bypasses entirely).
 * So the ONLY accounts whose WRITE access could change are non-SUPER_ADMIN
 * global EDITOR/MANAGER users. (GET handlers also tighten from "any
 * authenticated" → event member; that read-tightening is the intended
 * security goal — closing cross-event polling — not an access-removal we
 * gate on here.)
 *
 * Same shape + logic as preflight-branding-auth.ts (PR #34/Feature A).
 * Gates PR B (emails/templates 🔴 + attendees/send-email 🟠 cross-event data
 * isolation); PR A (the mechanical migration) is low-risk and ships ahead of
 * this per the human decision, but the access-change math is identical, so
 * this script covers the whole sweep.
 *
 * Run against PRODUCTION (read-only — no writes):
 *   npx dotenvx run -f .env.prod.local -- npx tsx prisma/scripts/preflight-event-auth-sweep.ts
 *
 * PASS → 0 affected users → migrate.
 * STOP → >0 → report the accounts; do NOT ship the tightening without a
 *        human decision (grant per-event membership first, or accept the
 *        access change deliberately).
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

  // Affected = non-SUPER_ADMIN global editor-tier accounts. These are the
  // only users who currently pass `authorize("editor"/"manager")` globally
  // but may lack per-event membership.
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
        `  ${u.role.padEnd(8)} ${u.email}  — editor/manager on ${editorMemberships}/${totalEvents} events; would lose event-write on ${
          totalEvents - editorMemberships
        }`
      );
    }
  }

  console.log(
    affected.length === 0
      ? "\nRESULT: PASS — migration changes nobody's write access. Safe to migrate."
      : "\nRESULT: STOP — affected user(s) exist. Do NOT ship the tightening without a human decision."
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
