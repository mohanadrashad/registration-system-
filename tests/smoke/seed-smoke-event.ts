/**
 * Seeds the dedicated smoke-test event (slug: smoke-e2e).
 *
 * Destructive ONLY for that one slug: the event is deleted and recreated on
 * every run (the Event cascade wipes all its child rows), so tests always
 * start from a known state. Never touches any other event.
 *
 * Creates:
 *   - Event "Smoke E2E Event" (active, selfServicePortal on, postRegPhases
 *     on by default) with a single-step REGISTRATION phase
 *     (firstName / lastName / email, all required) and one open
 *     POST_REGISTRATION phase "Travel Info" with a required TEXT field.
 *   - One pre-registered attendee (portal.tester@smoke.example.com,
 *     CONFIRMED) for the portal-login test.
 *
 * Run: npm run seed:smoke   (uses whatever DATABASE_URL is set)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const SMOKE_SLUG = "smoke-e2e";
export const PORTAL_TESTER_EMAIL = "portal.tester@smoke.example.com";

async function main() {
  console.log("Seeding smoke event on:", redactUrl(process.env.DATABASE_URL));

  // Full reset of the smoke event only — cascade removes every child row.
  await prisma.event.deleteMany({ where: { slug: SMOKE_SLUG } });

  const now = new Date();
  const startDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  const event = await prisma.event.create({
    data: {
      name: "Smoke E2E Event",
      slug: SMOKE_SLUG,
      description: "Automated smoke-test event — safe to delete.",
      venue: "Smoke Test Venue",
      startDate,
      endDate,
      isActive: true,
      // postRegPhases defaults to true; portal needs the explicit opt-in.
      modules: { create: { selfServicePortal: true } },
      phases: {
        create: [
          {
            type: "REGISTRATION",
            title: "Registration",
            order: 0,
            steps: { create: [{ title: "Your details", order: 0 }] },
          },
          {
            // No opensAt/closesAt → always OPEN on the portal.
            type: "POST_REGISTRATION",
            title: "Travel Info",
            order: 1,
            steps: { create: [{ title: "Travel", order: 0 }] },
          },
        ],
      },
    },
    include: {
      phases: { orderBy: { order: "asc" }, include: { steps: true } },
    },
  });

  const regStepId = event.phases[0].steps[0].id;
  const travelStepId = event.phases[1].steps[0].id;

  await prisma.formField.createMany({
    data: [
      {
        eventId: event.id,
        stepId: regStepId,
        name: "firstName",
        label: "First Name",
        type: "TEXT",
        required: true,
        order: 0,
        width: "HALF",
        isSystem: true,
      },
      {
        eventId: event.id,
        stepId: regStepId,
        name: "lastName",
        label: "Last Name",
        type: "TEXT",
        required: true,
        order: 1,
        width: "HALF",
        isSystem: true,
      },
      {
        eventId: event.id,
        stepId: regStepId,
        name: "email",
        label: "Email",
        type: "EMAIL",
        required: true,
        order: 2,
        isSystem: true,
      },
      {
        eventId: event.id,
        stepId: travelStepId,
        name: "airline",
        label: "Airline",
        type: "TEXT",
        required: true,
        order: 0,
      },
    ],
  });

  // Pre-registered attendee for the portal-login smoke test.
  const contact = await prisma.contact.create({
    data: {
      eventId: event.id,
      firstName: "Portal",
      lastName: "Tester",
      email: PORTAL_TESTER_EMAIL,
      status: "REGISTERED",
    },
  });
  await prisma.registration.create({
    data: {
      contactId: contact.id,
      eventId: event.id,
      status: "CONFIRMED",
      registeredAt: now,
      formData: {
        firstName: "Portal",
        lastName: "Tester",
        email: PORTAL_TESTER_EMAIL,
      },
    },
  });

  console.log(`Seeded event "${event.name}" (${event.id})`);
  console.log(`  /register/${SMOKE_SLUG}`);
  console.log(`  /portal/${SMOKE_SLUG}  (login: ${PORTAL_TESTER_EMAIL})`);
}

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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
