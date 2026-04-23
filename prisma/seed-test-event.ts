/**
 * Stage 0 test event harness for phase-based-forms work.
 *
 * Creates a realistic test event with a layered form (3 "sections" that will
 * become steps in Stage 1) and 5 varied registrations. Idempotent — re-running
 * won't duplicate. Runs against whatever DATABASE_URL is set; intended for
 * the staging Neon branch.
 *
 *   DATABASE_URL="<staging-url>" npx tsx prisma/seed-test-event.ts
 *
 * After Stage 1 lands, this harness will be updated to seed Phase/Step/
 * PhaseSubmission rows as well. For now it only populates what the current
 * flat FormField schema can represent.
 */
import {
  PrismaClient,
  Prisma,
  FieldType,
  FieldWidth,
  RegistrationStatus,
  ContactStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const TEST_EVENT_SLUG = "test-event-2026";

interface FieldSeed {
  name: string;
  label: string;
  labelAr: string;
  type: FieldType;
  section: string;
  order: number;
  required?: boolean;
  width?: FieldWidth;
  placeholder?: string;
  placeholderAr?: string;
  helpText?: string;
  helpTextAr?: string;
  isSystem?: boolean;
  options?: { value: string; label: string; labelAr?: string }[];
  conditional?: Prisma.InputJsonValue;
  validation?: Prisma.InputJsonValue;
}

// Sections prefixed with "Step N — " so Stage 1's backfill/migration can use
// the section name to split a single REGISTRATION phase into three ordered
// Step rows. Post-registration phases (flight / hotel / dietary) need the
// Stage 1 schema and are not seeded here.
const FIELDS: FieldSeed[] = [
  // ─── Step 1: Basic Info ──────────────────────────────────────────────
  {
    name: "firstName",
    label: "First Name",
    labelAr: "الاسم الأول",
    type: "TEXT",
    section: "Step 1 — Basic Info",
    order: 0,
    required: true,
    width: "HALF",
    isSystem: true,
  },
  {
    name: "lastName",
    label: "Last Name",
    labelAr: "اسم العائلة",
    type: "TEXT",
    section: "Step 1 — Basic Info",
    order: 1,
    required: true,
    width: "HALF",
    isSystem: true,
  },
  {
    name: "email",
    label: "Email",
    labelAr: "البريد الإلكتروني",
    type: "EMAIL",
    section: "Step 1 — Basic Info",
    order: 2,
    required: true,
    isSystem: true,
  },
  {
    name: "phone",
    label: "Phone Number",
    labelAr: "رقم الهاتف",
    type: "PHONE",
    section: "Step 1 — Basic Info",
    order: 3,
    required: true,
    width: "HALF",
  },
  {
    name: "organization",
    label: "Organization",
    labelAr: "الجهة / المنظمة",
    type: "TEXT",
    section: "Step 1 — Basic Info",
    order: 4,
    width: "HALF",
  },

  // ─── Step 2: Travel (with a visa-reveals conditional) ────────────────
  {
    name: "arrivalCountry",
    label: "Country of Residence",
    labelAr: "بلد الإقامة",
    type: "COUNTRY",
    section: "Step 2 — Travel",
    order: 10,
    required: true,
    helpText: "We use this to determine visa requirements.",
    helpTextAr: "نستخدمه لتحديد متطلبات التأشيرة.",
  },
  {
    name: "needsVisa",
    label: "I need a visa invitation letter",
    labelAr: "أحتاج خطاب دعوة للتأشيرة",
    type: "CHECKBOX",
    section: "Step 2 — Travel",
    order: 11,
  },
  {
    name: "passportNumber",
    label: "Passport Number",
    labelAr: "رقم الجواز",
    type: "TEXT",
    section: "Step 2 — Travel",
    order: 12,
    required: true,
    width: "HALF",
    conditional: {
      showIf: { field: "needsVisa", operator: "equals", value: true },
    },
  },
  {
    name: "passportExpiry",
    label: "Passport Expiry Date",
    labelAr: "تاريخ انتهاء الجواز",
    type: "DATE",
    section: "Step 2 — Travel",
    order: 13,
    required: true,
    width: "HALF",
    conditional: {
      showIf: { field: "needsVisa", operator: "equals", value: true },
    },
  },

  // ─── Step 3: Interests ───────────────────────────────────────────────
  {
    name: "topics",
    label: "Topics You're Interested In",
    labelAr: "المواضيع التي تهمك",
    type: "MULTISELECT",
    section: "Step 3 — Interests",
    order: 20,
    options: [
      { value: "ai", label: "AI & Machine Learning", labelAr: "الذكاء الاصطناعي" },
      { value: "product", label: "Product Design", labelAr: "تصميم المنتجات" },
      { value: "eng", label: "Engineering", labelAr: "الهندسة" },
      { value: "biz", label: "Business & Strategy", labelAr: "الأعمال والاستراتيجية" },
      { value: "research", label: "Research", labelAr: "الأبحاث" },
    ],
  },
  {
    name: "dietary",
    label: "Dietary Preference",
    labelAr: "التفضيل الغذائي",
    type: "SELECT",
    section: "Step 3 — Interests",
    order: 21,
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
    name: "bio",
    label: "Short Bio",
    labelAr: "نبذة قصيرة",
    type: "TEXTAREA",
    section: "Step 3 — Interests",
    order: 22,
    placeholder: "Tell us a bit about yourself (optional).",
    placeholderAr: "أخبرنا قليلاً عن نفسك (اختياري).",
    validation: { maxLength: 500 },
  },
];

interface RegistrationSeed {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organization: string;
  arrivalCountry: string;
  needsVisa: boolean;
  passportNumber?: string;
  passportExpiry?: string;
  topics: string[];
  dietary: string;
  bio?: string;
  status: RegistrationStatus;
  contactStatus: ContactStatus;
}

const REGISTRATIONS: RegistrationSeed[] = [
  {
    firstName: "Layla",
    lastName: "Al-Saud",
    email: "layla.alsaud@example.com",
    phone: "+966501234567",
    organization: "Neom",
    arrivalCountry: "SA",
    needsVisa: false,
    topics: ["ai", "product"],
    dietary: "halal",
    bio: "Product lead exploring AI-assisted design workflows.",
    status: "CONFIRMED",
    contactStatus: "REGISTERED",
  },
  {
    firstName: "Hiroshi",
    lastName: "Tanaka",
    email: "hiroshi.tanaka@example.com",
    phone: "+81901234567",
    organization: "Sony Research",
    arrivalCountry: "JP",
    needsVisa: true,
    passportNumber: "TK1234567",
    passportExpiry: "2029-08-14",
    topics: ["ai", "research", "eng"],
    dietary: "none",
    bio: "Research scientist, 10 years in computer vision.",
    status: "CONFIRMED",
    contactStatus: "REGISTERED",
  },
  {
    firstName: "Aisha",
    lastName: "Okafor",
    email: "aisha.okafor@example.com",
    phone: "+2348031234567",
    organization: "Flutterwave",
    arrivalCountry: "NG",
    needsVisa: true,
    passportNumber: "A09876543",
    passportExpiry: "2027-03-22",
    topics: ["biz"],
    dietary: "veg",
    status: "PENDING_APPROVAL",
    contactStatus: "REGISTERED",
  },
  {
    firstName: "Marco",
    lastName: "Rossi",
    email: "marco.rossi@example.com",
    phone: "+393331234567",
    organization: "Politecnico di Milano",
    arrivalCountry: "IT",
    needsVisa: false,
    topics: ["eng", "product"],
    dietary: "none",
    bio: "Systems engineer, working on distributed databases.",
    status: "CONFIRMED",
    contactStatus: "REGISTERED",
  },
  {
    firstName: "Priya",
    lastName: "Menon",
    email: "priya.menon@example.com",
    phone: "+919876543210",
    organization: "Razorpay",
    arrivalCountry: "IN",
    needsVisa: true,
    passportNumber: "Z1234567",
    passportExpiry: "2028-11-05",
    topics: ["biz", "product"],
    dietary: "vegan",
    status: "WAITLISTED",
    contactStatus: "REGISTERED",
  },
];

async function main() {
  console.log("Seeding test event on database:", redactUrl(process.env.DATABASE_URL));

  const existing = await prisma.event.findUnique({
    where: { slug: TEST_EVENT_SLUG },
  });

  if (existing) {
    console.log(`Event "${TEST_EVENT_SLUG}" already exists — nothing to do.`);
    return;
  }

  const now = new Date();
  const startDate = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // +3 weeks
  const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000); // 2-day event

  const event = await prisma.event.create({
    data: {
      name: "Test Event 2026",
      slug: TEST_EVENT_SLUG,
      description:
        "Staging test event for phase-based forms. Covers multi-step registration with conditional visa fields.",
      venue: "Test Venue, Riyadh",
      startDate,
      endDate,
      isActive: true,
      categories: ["VIP", "Speaker", "Attendee"],
      modules: { create: {} }, // defaults; multiLanguage stays false
    },
  });
  console.log(`Created event: ${event.name} (${event.id})`);

  const fieldRows: Prisma.FormFieldCreateManyInput[] = FIELDS.map((f) => ({
    eventId: event.id,
    name: f.name,
    label: f.label,
    labelAr: f.labelAr,
    type: f.type,
    required: f.required ?? false,
    order: f.order,
    width: f.width ?? "FULL",
    section: f.section,
    placeholder: f.placeholder,
    placeholderAr: f.placeholderAr,
    helpText: f.helpText,
    helpTextAr: f.helpTextAr,
    isSystem: f.isSystem ?? false,
    options: (f.options ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    conditional: f.conditional ?? Prisma.JsonNull,
    validation: f.validation ?? Prisma.JsonNull,
  }));
  await prisma.formField.createMany({ data: fieldRows });
  console.log(`Created ${FIELDS.length} form fields across 3 sections.`);

  for (const r of REGISTRATIONS) {
    const contact = await prisma.contact.create({
      data: {
        eventId: event.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        organization: r.organization,
        status: r.contactStatus,
      },
    });

    const formData: Record<string, unknown> = {
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      organization: r.organization,
      arrivalCountry: r.arrivalCountry,
      needsVisa: r.needsVisa,
      topics: r.topics,
      dietary: r.dietary,
    };
    if (r.needsVisa) {
      formData.passportNumber = r.passportNumber;
      formData.passportExpiry = r.passportExpiry;
    }
    if (r.bio) formData.bio = r.bio;

    await prisma.registration.create({
      data: {
        contactId: contact.id,
        eventId: event.id,
        status: r.status,
        registeredAt: r.status === "CONFIRMED" ? new Date() : null,
        formData: formData as Prisma.InputJsonValue,
      },
    });
  }
  console.log(`Created ${REGISTRATIONS.length} seeded registrations.`);

  console.log("\nDone. Log in and visit:");
  console.log(`  /register/${TEST_EVENT_SLUG}   (public registration form)`);
  console.log(`  /dashboard/events/${event.id}  (admin view)`);
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
