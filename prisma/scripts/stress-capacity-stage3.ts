/**
 * Stage 3 capacity stress test.
 *
 * Creates a temporary event with a single POST_REGISTRATION phase carrying
 * a capacity-1 PhaseOption, plus N registrations. Fires all N submissions
 * in parallel against `submitAttendeeSelections`. The expected outcome:
 *
 *   • Exactly ONE submission succeeds.
 *   • The other N-1 throw OptionFullError.
 *
 * If the row-level FOR UPDATE lock weren't holding under load, we'd see
 * multiple "successes" (over-capacity inserts) — which would either get
 * rejected by Postgres's unique constraint with a different error, or
 * would silently over-fill the option. Either is a bug. The assertion at
 * the end of the script is the gate.
 *
 * Run with:
 *
 *   npx tsx prisma/scripts/stress-capacity-stage3.ts
 *
 * Optional env: STRESS_PARALLEL=N (default 25).
 *
 * Note on N: the default Prisma connection pool is 9 (num_cpus * 2 + 1).
 * Beyond ~25 concurrent transactions, the bottleneck shifts from the
 * row lock to connection-pool exhaustion — surfaces as "Timed out
 * fetching a new connection from the connection pool" errors. That's
 * an ops concern, not a correctness regression: the AttendeeSelection
 * row count in the DB still matches "exactly 1." If you want to stress
 * higher N, append `?connection_limit=50` to DATABASE_URL.
 *
 * The script cleans up after itself (cascade deletes via the temp event).
 */

import { PrismaClient } from "@prisma/client";
import {
  OptionFullError,
  submitAttendeeSelections,
} from "../../src/lib/services/selection.service";

const prisma = new PrismaClient();

async function main() {
  const N = parseInt(process.env.STRESS_PARALLEL ?? "25", 10);
  const stamp = `stage3-stress-${Date.now()}`;

  console.log(`\n=== Stage 3 capacity stress test ===`);
  console.log(`Parallel attendees: ${N}`);
  console.log(`Setting up temporary event "${stamp}"…`);

  // ── Setup ────────────────────────────────────────────────────────
  const event = await prisma.event.create({
    data: {
      name: stamp,
      slug: stamp,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      modules: { create: { selfServicePortal: true, postRegPhases: true } },
    },
  });
  const phase = await prisma.phase.create({
    data: {
      eventId: event.id,
      type: "POST_REGISTRATION",
      title: "Stress phase",
      order: 1,
      isActive: true,
      selectionMode: "ATTENDEE_PICKS",
      maxSelections: 1,
      allowChangeAfterSubmit: false,
      requiresReceiptUpload: false,
      steps: { create: { title: "Details", order: 0 } },
    },
  });
  const option = await prisma.phaseOption.create({
    data: {
      phaseId: phase.id,
      label: "Capacity-1 hot ticket",
      order: 0,
      capacity: 1,
      isActive: true,
    },
  });

  // N attendees.
  const registrations: { id: string; email: string }[] = [];
  for (let i = 0; i < N; i++) {
    const email = `stress-${i}@${stamp}.test`;
    const contact = await prisma.contact.create({
      data: {
        eventId: event.id,
        firstName: "Stress",
        lastName: `Tester ${i}`,
        email,
        status: "REGISTERED",
      },
    });
    const registration = await prisma.registration.create({
      data: {
        eventId: event.id,
        contactId: contact.id,
        status: "CONFIRMED",
        registeredAt: new Date(),
      },
    });
    registrations.push({ id: registration.id, email });
  }

  console.log(`Setup complete. Firing ${N} parallel submissions against a capacity-1 option…\n`);

  // ── Race ─────────────────────────────────────────────────────────
  // We fire all N at once via Promise.allSettled so we can inspect each
  // outcome. Inside each call: prisma.$transaction with FOR UPDATE on
  // the option row + COUNT before INSERT.
  type Outcome =
    | { kind: "success"; registrationId: string }
    | { kind: "full"; registrationId: string }
    | { kind: "other"; registrationId: string; error: string };

  const start = Date.now();
  const settled = await Promise.allSettled(
    registrations.map(async (reg): Promise<Outcome> => {
      try {
        await submitAttendeeSelections({
          phaseId: phase.id,
          registrationId: reg.id,
          optionIds: [option.id],
          expectedSelectionsUpdatedAt: null,
          eventId: event.id,
        });
        return { kind: "success", registrationId: reg.id };
      } catch (e) {
        if (e instanceof OptionFullError) {
          return { kind: "full", registrationId: reg.id };
        }
        return {
          kind: "other",
          registrationId: reg.id,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );
  const elapsedMs = Date.now() - start;

  const outcomes: Outcome[] = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : {
          kind: "other" as const,
          registrationId: "?",
          error: String(s.reason),
        }
  );

  const successes = outcomes.filter((o) => o.kind === "success").length;
  const fulls = outcomes.filter((o) => o.kind === "full").length;
  const others = outcomes.filter((o) => o.kind === "other") as Array<
    Outcome & { kind: "other" }
  >;

  console.log(`Race finished in ${elapsedMs}ms`);
  console.log(`  successes : ${successes}`);
  console.log(`  full      : ${fulls}`);
  console.log(`  other     : ${others.length}`);
  if (others.length > 0) {
    console.log("  unexpected error samples:");
    for (const o of others.slice(0, 5)) {
      console.log(`    - ${o.error}`);
    }
  }

  // ── Cross-check against the database ────────────────────────────
  const rowCount = await prisma.attendeeSelection.count({
    where: { phaseId: phase.id, optionId: option.id },
  });
  console.log(`  AttendeeSelection rows in DB: ${rowCount}`);

  // ── Cleanup ─────────────────────────────────────────────────────
  // Cascade deletes from Event take care of everything.
  await prisma.event.delete({ where: { id: event.id } });
  console.log(`Cleanup done.\n`);

  // ── Assert ──────────────────────────────────────────────────────
  let failed = false;
  if (successes !== 1) {
    console.error(
      `❌ FAIL: expected exactly 1 success, got ${successes}`
    );
    failed = true;
  }
  if (fulls !== N - 1) {
    console.error(
      `❌ FAIL: expected ${N - 1} OptionFullError, got ${fulls}`
    );
    failed = true;
  }
  if (others.length > 0) {
    console.error(
      `❌ FAIL: ${others.length} unexpected error(s) — see samples above`
    );
    failed = true;
  }
  if (rowCount !== 1) {
    console.error(
      `❌ FAIL: expected exactly 1 AttendeeSelection row in DB, got ${rowCount}`
    );
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    console.error(`\n=== Stage 3 capacity stress test: FAILED ===\n`);
  } else {
    console.log(`✅ PASS: 1 success / ${N - 1} OPTION_FULL / 0 other.`);
    console.log(`\n=== Stage 3 capacity stress test: PASSED ===\n`);
  }
}

main()
  .catch((e) => {
    console.error("Script crashed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
