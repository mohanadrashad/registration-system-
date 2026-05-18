/**
 * Staging seed for Phase Selections work.
 *
 * Idempotent — safe to re-run. Uses upserts on stable identifiers (User.email,
 * Event.slug, EventModules.eventId, EventMember.userId+eventId, FormField.eventId+name,
 * Contact.eventId+email, Registration.contactId). For Phase / Step rows that don't
 * have a natural unique we check (eventId, type, title) and (phaseId, title) and
 * create only when missing.
 *
 * Run with the password set in env:
 *
 *   SEED_ADMIN_PASSWORD="<your password>" npm run seed:staging
 *
 * The script writes against whatever DATABASE_URL is set — point it at the
 * staging Neon branch before running.
 */
import {
  PrismaClient,
  Prisma,
  FieldType,
  FieldWidth,
  PhaseType,
  RegistrationStatus,
  ContactStatus,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@staging.local";
const ADMIN_NAME = "Staging Admin";
const EVENT_SLUG = "staging-test-event-2026";
const EVENT_NAME = "Staging Test Event 2026";

const ENABLED_MODULES = {
  formBuilder: true,
  checkIn: true,
  multiLanguage: true,
  postRegPhases: true,
  selfServicePortal: true,
  customEmail: true,
  approvalWorkflow: true,
  // Modules not in the requested set stay at their schema default (false).
} as const;

interface Counter {
  created: number;
  skipped: number;
}
const counters: Record<string, Counter> = {
  users: { created: 0, skipped: 0 },
  events: { created: 0, skipped: 0 },
  modules: { created: 0, skipped: 0 },
  members: { created: 0, skipped: 0 },
  phases: { created: 0, skipped: 0 },
  steps: { created: 0, skipped: 0 },
  fields: { created: 0, skipped: 0 },
  contacts: { created: 0, skipped: 0 },
  registrations: { created: 0, skipped: 0 },
};

function readPassword(): string {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is required.\n" +
        "Set it in your shell before running:\n\n" +
        '    SEED_ADMIN_PASSWORD="<your password>" npm run seed:staging\n'
    );
  }
  if (password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  }
  return password;
}

// ─── Registration phase fields (Step 1 only) ─────────────────────────────────

interface FieldSeed {
  name: string;
  label: string;
  labelAr: string;
  type: FieldType;
  order: number;
  required?: boolean;
  width?: FieldWidth;
  placeholder?: string;
  isSystem?: boolean;
  options?: { value: string; label: string; labelAr?: string }[];
  validation?: Prisma.InputJsonValue;
}

const REGISTRATION_FIELDS: FieldSeed[] = [
  {
    name: "fullName",
    label: "Full Name",
    labelAr: "الاسم الكامل",
    type: "TEXT",
    order: 0,
    required: true,
    isSystem: true,
  },
  {
    name: "email",
    label: "Email",
    labelAr: "البريد الإلكتروني",
    type: "EMAIL",
    order: 1,
    required: true,
    isSystem: true,
  },
  {
    name: "phone",
    label: "Phone Number",
    labelAr: "رقم الهاتف",
    type: "PHONE",
    order: 2,
    width: "HALF",
  },
  {
    name: "dietary",
    label: "Dietary Preferences",
    labelAr: "التفضيلات الغذائية",
    type: "SELECT",
    order: 3,
    width: "HALF",
    options: [
      { value: "none", label: "No restrictions", labelAr: "بدون قيود" },
      { value: "veg", label: "Vegetarian", labelAr: "نباتي" },
      { value: "vegan", label: "Vegan", labelAr: "نباتي صارم" },
      { value: "halal", label: "Halal", labelAr: "حلال" },
      { value: "kosher", label: "Kosher", labelAr: "كوشر" },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    labelAr: "ملاحظات",
    type: "TEXTAREA",
    order: 4,
    placeholder: "Anything we should know? (optional)",
    validation: { maxLength: 500 },
  },
];

// ─── Post-registration phases (selectionMode stays NONE in Stage 1) ──────────

interface PostRegPhaseSeed {
  title: string;
  titleAr: string;
  description: string;
  /** Days before event start when this phase opens. */
  opensDaysBefore: number;
  /** Days before event start when this phase closes. */
  closesDaysBefore: number;
  fields: FieldSeed[];
}

const POST_REG_PHASES: PostRegPhaseSeed[] = [
  {
    title: "Flight info",
    titleAr: "معلومات الرحلة",
    description: "Tell us about your inbound flight so we can plan transfers.",
    opensDaysBefore: 14,
    closesDaysBefore: 3,
    fields: [
      {
        name: "arrivalDate",
        label: "Arrival Date",
        labelAr: "تاريخ الوصول",
        type: "DATE",
        order: 0,
        required: true,
        width: "HALF",
      },
      {
        name: "arrivalTime",
        label: "Arrival Time",
        labelAr: "وقت الوصول",
        type: "TIME",
        order: 1,
        width: "HALF",
      },
      {
        name: "flightNumber",
        label: "Flight Number",
        labelAr: "رقم الرحلة",
        type: "TEXT",
        order: 2,
        placeholder: "e.g. SV123",
      },
    ],
  },
  {
    title: "Hotel preferences",
    titleAr: "تفضيلات الفندق",
    description: "Help us coordinate your hotel arrangements.",
    opensDaysBefore: 7,
    closesDaysBefore: 2,
    fields: [
      {
        name: "preferredCheckInDate",
        label: "Preferred Check-in Date",
        labelAr: "تاريخ الوصول المفضل",
        type: "DATE",
        order: 0,
        required: true,
        width: "HALF",
      },
      {
        name: "specialRequests",
        label: "Special Requests",
        labelAr: "طلبات خاصة",
        type: "TEXTAREA",
        order: 1,
        placeholder: "Accessibility, dietary, anything else (optional).",
        validation: { maxLength: 500 },
      },
    ],
  },
];

// ─── Test registrations ──────────────────────────────────────────────────────

interface RegistrationSeed {
  index: number;
  fullName: string;
  email: string;
  phone: string;
  dietary: string;
  notes?: string;
}

const REGISTRATIONS: RegistrationSeed[] = [
  {
    index: 1,
    fullName: "Test User One",
    email: "test1@staging.local",
    phone: "+966500000001",
    dietary: "halal",
    notes: "Looking forward to the keynote.",
  },
  {
    index: 2,
    fullName: "Test User Two",
    email: "test2@staging.local",
    phone: "+966500000002",
    dietary: "veg",
  },
  {
    index: 3,
    fullName: "Test User Three",
    email: "test3@staging.local",
    phone: "+966500000003",
    dietary: "vegan",
    notes: "Vegan + nut allergy.",
  },
  {
    index: 4,
    fullName: "Test User Four",
    email: "test4@staging.local",
    phone: "+966500000004",
    dietary: "none",
  },
  {
    index: 5,
    fullName: "Test User Five",
    email: "test5@staging.local",
    phone: "+966500000005",
    dietary: "kosher",
    notes: "Will need a quiet room for prayers.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

async function main() {
  const password = readPassword();
  console.log("Seeding staging on database:", redactUrl(process.env.DATABASE_URL));

  // ─── Admin user ───────────────────────────────────────────────────────────
  const existingUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const hashedPassword = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      // Re-hash so re-runs with a different SEED_ADMIN_PASSWORD update the
      // password (this is a staging convenience, not a production behavior).
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      name: ADMIN_NAME,
    },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });
  if (existingUser) counters.users.skipped++;
  else counters.users.created++;

  // ─── Event ────────────────────────────────────────────────────────────────
  const now = new Date();
  // Event happens ~6 months out; registration window opens last week, closes
  // when the event starts.
  const startDate = new Date(now.getTime() + days(180));
  const endDate = new Date(startDate.getTime() + days(2));
  const regOpensAt = new Date(now.getTime() - days(7));
  const regClosesAt = startDate;

  const existingEvent = await prisma.event.findUnique({ where: { slug: EVENT_SLUG } });
  const event = await prisma.event.upsert({
    where: { slug: EVENT_SLUG },
    update: {
      // Don't overwrite admin-edited descriptive fields on re-run; only ensure
      // the active flag and dates remain sensible.
      isActive: true,
    },
    create: {
      name: EVENT_NAME,
      slug: EVENT_SLUG,
      description:
        "Staging test event for Phase Selections work. Includes a registration phase with 5 fields and two post-registration phases (Flight info, Hotel preferences).",
      venue: "Staging Venue, Riyadh",
      startDate,
      endDate,
      isActive: true,
      categories: ["VIP", "Speaker", "Attendee"],
    },
  });
  if (existingEvent) counters.events.skipped++;
  else counters.events.created++;

  // ─── EventModules ─────────────────────────────────────────────────────────
  const existingModules = await prisma.eventModules.findUnique({
    where: { eventId: event.id },
  });
  await prisma.eventModules.upsert({
    where: { eventId: event.id },
    update: ENABLED_MODULES,
    create: { eventId: event.id, ...ENABLED_MODULES },
  });
  if (existingModules) counters.modules.skipped++;
  else counters.modules.created++;

  // ─── EventMember (admin user gets MANAGER on this event) ──────────────────
  const existingMember = await prisma.eventMember.findUnique({
    where: { userId_eventId: { userId: admin.id, eventId: event.id } },
  });
  await prisma.eventMember.upsert({
    where: { userId_eventId: { userId: admin.id, eventId: event.id } },
    update: { role: UserRole.MANAGER },
    create: {
      userId: admin.id,
      eventId: event.id,
      role: UserRole.MANAGER,
    },
  });
  if (existingMember) counters.members.skipped++;
  else counters.members.created++;

  // ─── REGISTRATION phase + 1 step + fields ─────────────────────────────────
  const regPhase = await upsertPhase({
    eventId: event.id,
    type: PhaseType.REGISTRATION,
    title: "Registration",
    titleAr: "التسجيل",
    description: null,
    descriptionAr: null,
    order: 0,
    opensAt: regOpensAt,
    closesAt: regClosesAt,
    isRequired: true,
  });

  const regStep = await upsertStep({
    phaseId: regPhase.id,
    title: "Registration",
    titleAr: "التسجيل",
    order: 0,
  });

  for (const f of REGISTRATION_FIELDS) {
    await upsertField(event.id, regStep.id, f);
  }

  // ─── POST_REGISTRATION phases ─────────────────────────────────────────────
  for (let i = 0; i < POST_REG_PHASES.length; i++) {
    const seed = POST_REG_PHASES[i];
    const opensAt = new Date(startDate.getTime() - days(seed.opensDaysBefore));
    const closesAt = new Date(startDate.getTime() - days(seed.closesDaysBefore));

    const phase = await upsertPhase({
      eventId: event.id,
      type: PhaseType.POST_REGISTRATION,
      title: seed.title,
      titleAr: seed.titleAr,
      description: seed.description,
      descriptionAr: null,
      order: i + 1, // REGISTRATION uses order 0
      opensAt,
      closesAt,
      isRequired: false,
    });

    const step = await upsertStep({
      phaseId: phase.id,
      title: seed.title,
      titleAr: seed.titleAr,
      order: 0,
    });

    for (const f of seed.fields) {
      await upsertField(event.id, step.id, f);
    }
  }

  // ─── 5 confirmed test registrations ───────────────────────────────────────
  for (const r of REGISTRATIONS) {
    const [firstName, ...rest] = r.fullName.split(" ");
    const lastName = rest.join(" ");

    const existingContact = await prisma.contact.findUnique({
      where: { eventId_email: { eventId: event.id, email: r.email } },
    });
    const contact = await prisma.contact.upsert({
      where: { eventId_email: { eventId: event.id, email: r.email } },
      update: {
        firstName,
        lastName,
        phone: r.phone,
        status: ContactStatus.REGISTERED,
      },
      create: {
        eventId: event.id,
        firstName,
        lastName,
        email: r.email,
        phone: r.phone,
        status: ContactStatus.REGISTERED,
      },
    });
    if (existingContact) counters.contacts.skipped++;
    else counters.contacts.created++;

    const formData: Record<string, unknown> = {
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      dietary: r.dietary,
    };
    if (r.notes) formData.notes = r.notes;

    const existingRegistration = await prisma.registration.findUnique({
      where: { contactId: contact.id },
    });
    await prisma.registration.upsert({
      where: { contactId: contact.id },
      update: {
        status: RegistrationStatus.CONFIRMED,
        registeredAt: existingRegistration?.registeredAt ?? new Date(),
        formData: formData as Prisma.InputJsonValue,
      },
      create: {
        contactId: contact.id,
        eventId: event.id,
        status: RegistrationStatus.CONFIRMED,
        registeredAt: new Date(),
        formData: formData as Prisma.InputJsonValue,
      },
    });
    if (existingRegistration) counters.registrations.skipped++;
    else counters.registrations.created++;
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n─── Seed summary ─────────────────────────────────────");
  for (const [name, c] of Object.entries(counters)) {
    console.log(`  ${name.padEnd(15)} created: ${c.created}, skipped: ${c.skipped}`);
  }
  console.log("\nAdmin login:");
  console.log(`  email   : ${ADMIN_EMAIL}`);
  console.log(`  password: (the SEED_ADMIN_PASSWORD value you set)`);
  console.log("\nEvent:");
  console.log(`  slug    : ${EVENT_SLUG}`);
  console.log(`  public  : /register/${EVENT_SLUG}`);
  console.log(`  admin   : /dashboard/events/${event.id}`);
  console.log("──────────────────────────────────────────────────────");
}

// ─── Phase / Step / Field upsert helpers ─────────────────────────────────────

interface PhaseUpsertInput {
  eventId: string;
  type: PhaseType;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  order: number;
  opensAt: Date | null;
  closesAt: Date | null;
  isRequired: boolean;
}

async function upsertPhase(input: PhaseUpsertInput) {
  // Phase has no name-based unique. Match on (eventId, type, title) — stable
  // for our seed since titles are fixed.
  const existing = await prisma.phase.findFirst({
    where: { eventId: input.eventId, type: input.type, title: input.title },
  });

  if (existing) {
    counters.phases.skipped++;
    // Keep dates and metadata up to date on re-runs so the test event tracks
    // "now" instead of stale absolute dates from the first seeding.
    return prisma.phase.update({
      where: { id: existing.id },
      data: {
        titleAr: input.titleAr,
        description: input.description,
        descriptionAr: input.descriptionAr,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        isRequired: input.isRequired,
      },
    });
  }

  counters.phases.created++;
  return prisma.phase.create({
    data: {
      eventId: input.eventId,
      type: input.type,
      title: input.title,
      titleAr: input.titleAr,
      description: input.description,
      descriptionAr: input.descriptionAr,
      order: input.order,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      isRequired: input.isRequired,
    },
  });
}

interface StepUpsertInput {
  phaseId: string;
  title: string;
  titleAr: string | null;
  order: number;
}

async function upsertStep(input: StepUpsertInput) {
  // Step has @@unique([phaseId, order]) but no title unique. Match on
  // (phaseId, title) to be resilient if order is later renumbered.
  const existing = await prisma.step.findFirst({
    where: { phaseId: input.phaseId, title: input.title },
  });
  if (existing) {
    counters.steps.skipped++;
    return prisma.step.update({
      where: { id: existing.id },
      data: { titleAr: input.titleAr, order: input.order },
    });
  }
  counters.steps.created++;
  return prisma.step.create({
    data: {
      phaseId: input.phaseId,
      title: input.title,
      titleAr: input.titleAr,
      order: input.order,
    },
  });
}

async function upsertField(eventId: string, stepId: string, f: FieldSeed) {
  const existing = await prisma.formField.findUnique({
    where: { eventId_name: { eventId, name: f.name } },
  });
  const data = {
    eventId,
    stepId,
    name: f.name,
    label: f.label,
    labelAr: f.labelAr,
    type: f.type,
    required: f.required ?? false,
    order: f.order,
    width: f.width ?? FieldWidth.FULL,
    placeholder: f.placeholder,
    isSystem: f.isSystem ?? false,
    options: (f.options ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    validation: f.validation ?? Prisma.JsonNull,
  };
  if (existing) {
    counters.fields.skipped++;
    await prisma.formField.update({ where: { id: existing.id }, data });
  } else {
    counters.fields.created++;
    await prisma.formField.create({ data });
  }
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
