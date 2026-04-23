/**
 * Stage 1 backfill — Phase → Step → FormField migration.
 *
 * For every existing Event that doesn't yet have a REGISTRATION Phase:
 *   1. Create Phase {type: REGISTRATION, title: "Registration", order: 0}.
 *   2. Determine steps from FormField.section values:
 *        - If the event has multiple distinct non-null sections, create one
 *          Step per section (ordered alphabetically by section name).
 *        - Otherwise create a single Step titled "Details".
 *   3. Assign every FormField on the event that has stepId = NULL to the
 *      step whose title matches its section (or the single "Details" step).
 *
 * Idempotent — re-running is safe. Logs per-event what was created vs skipped.
 *
 *   DATABASE_URL="<url>" npx tsx prisma/scripts/migrate-to-phase-step-model.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function redactUrl(url?: string) {
  if (!url) return "(unset)";
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return "(unparseable)";
  }
}

async function migrateEvent(event: { id: string; name: string }) {
  // Skip if a REGISTRATION phase already exists (idempotence).
  const existing = await prisma.phase.findFirst({
    where: { eventId: event.id, type: "REGISTRATION" },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  const phase =
    existing ??
    (await prisma.phase.create({
      data: {
        eventId: event.id,
        type: "REGISTRATION",
        title: "Registration",
        titleAr: "التسجيل",
        order: 0,
        isActive: true,
      },
      include: { steps: { orderBy: { order: "asc" } } },
    }));

  // Load this event's fields, group by section.
  const fields = await prisma.formField.findMany({
    where: { eventId: event.id },
    orderBy: { order: "asc" },
  });

  const sectionsInUse = new Set<string | null>(
    fields.map((f) => f.section ?? null)
  );
  const hasMultipleSections =
    Array.from(sectionsInUse).filter((s) => s && s.trim().length > 0).length >
    1;

  // Build the desired list of step titles in deterministic order.
  const desiredSteps: { title: string; titleAr?: string | null }[] = [];
  if (hasMultipleSections) {
    const titles = Array.from(sectionsInUse)
      .filter((s): s is string => !!s && s.trim().length > 0)
      .sort();
    // Push sections first, then a trailing "Details" step for any fields
    // without a section so nothing gets orphaned.
    for (const t of titles) desiredSteps.push({ title: t });
    if (sectionsInUse.has(null) || sectionsInUse.has("")) {
      desiredSteps.push({ title: "Details", titleAr: "التفاصيل" });
    }
  } else {
    desiredSteps.push({ title: "Details", titleAr: "التفاصيل" });
  }

  // Create any missing steps (idempotent via title match within the phase).
  const stepsByTitle = new Map(phase.steps.map((s) => [s.title, s]));
  for (let i = 0; i < desiredSteps.length; i++) {
    const d = desiredSteps[i];
    if (stepsByTitle.has(d.title)) continue;
    const created = await prisma.step.create({
      data: {
        phaseId: phase.id,
        title: d.title,
        titleAr: d.titleAr ?? null,
        order: i,
      },
    });
    stepsByTitle.set(created.title, created);
  }

  // Assign any field with stepId = null to the matching step.
  const singleStep = stepsByTitle.get("Details");
  let assigned = 0;
  for (const field of fields) {
    if (field.stepId) continue;
    const targetTitle = hasMultipleSections
      ? (field.section && field.section.trim().length > 0
          ? field.section
          : "Details")
      : "Details";
    const targetStep = stepsByTitle.get(targetTitle) ?? singleStep;
    if (!targetStep) {
      console.warn(
        `  · could not resolve step for field ${field.name} (section="${field.section}") on event ${event.id}`
      );
      continue;
    }
    await prisma.formField.update({
      where: { id: field.id },
      data: { stepId: targetStep.id },
    });
    assigned++;
  }

  return {
    event,
    phaseCreated: !existing,
    stepsNow: stepsByTitle.size,
    fieldsAssigned: assigned,
    totalFields: fields.length,
  };
}

async function main() {
  console.log("Backfilling Phase/Step for existing events on DB:", redactUrl(process.env.DATABASE_URL));

  const events = await prisma.event.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (events.length === 0) {
    console.log("No events to migrate — nothing to do.");
    return;
  }

  let phasesCreated = 0;
  let totalAssigned = 0;
  for (const event of events) {
    const result = await migrateEvent(event);
    if (result.phaseCreated) phasesCreated++;
    totalAssigned += result.fieldsAssigned;
    console.log(
      `  · ${event.name} (${event.id}): ${result.phaseCreated ? "created phase, " : "phase exists, "}${result.stepsNow} step(s), ${result.fieldsAssigned}/${result.totalFields} fields assigned`
    );
  }

  console.log(
    `\nDone. ${events.length} event(s) scanned, ${phasesCreated} new REGISTRATION phase(s) created, ${totalAssigned} FormField.stepId assignments made.`
  );

  // Sanity check: how many FormField rows still have NULL stepId?
  const orphaned = await prisma.formField.count({
    where: { stepId: null },
  });
  if (orphaned > 0) {
    console.warn(
      `\n⚠ ${orphaned} FormField row(s) still have stepId = NULL. Pass 3 (making stepId required) will fail until this is zero. Investigate before merging Pass 3.`
    );
    process.exitCode = 2;
  } else {
    console.log("✓ Every FormField has stepId set — safe to proceed to Pass 3.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
