import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import {
  createContactSchema,
  validateCategoryForEvent,
} from "@/lib/validations/contact";
import { randomBytes } from "crypto";
import { contactService } from "@/lib/services/contact.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  // Read-only endpoint: any event member can fetch this.
  // "authenticated" is the lowest RoleRequirement and maps to
  // canViewEvent (passes when eventRole !== null OR SUPER_ADMIN).
  // Mirrors the Stage 2 approvals-GET migration — closes the
  // asymmetric posture where Stage 2's PUT/DELETE/POST migrations
  // gated writes per-event but reads remained open to any logged-in
  // user across the codebase.
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const status = searchParams.get("status") || "";
  const groupBy = searchParams.get("groupBy") || "";

  const where: Record<string, unknown> = { eventId };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { organization: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category) {
    where.category = category;
  }

  if (status) {
    where.status = status;
  }

  try {
    // Grouped by category mode for the Attendees page
    if (groupBy === "category") {
      const contacts = await prisma.contact.findMany({
        where,
        include: { registration: { select: { status: true, registeredAt: true, confirmationCode: true } } },
        orderBy: [{ category: "asc" }, { createdAt: "desc" }],
      });

      // Canonical, ordered category spine from Event.categories (via
      // the service) — not derived from whatever is on Contact rows.
      // Defined categories always appear (even with zero matches under
      // the active search/status filter); any stray or null category
      // folds into the trailing "Uncategorized" tab.
      const spine = await contactService.getCategories(eventId);
      const UNCAT = "Uncategorized";
      const definedSet = new Set(
        spine
          .map((s) => s.category)
          .filter((c): c is string => c !== null)
      );

      const buckets = new Map<string, typeof contacts>();
      for (const contact of contacts) {
        const key =
          contact.category && definedSet.has(contact.category)
            ? contact.category
            : UNCAT;
        const list = buckets.get(key);
        if (list) list.push(contact);
        else buckets.set(key, [contact]);
      }

      const groups = spine.map(({ category }) => {
        const key = category ?? UNCAT;
        const items = buckets.get(key) ?? [];
        return { category: key, count: items.length, contacts: items };
      });

      const statusCounts = {
        IMPORTED: 0,
        INVITED: 0,
        REGISTERED: 0,
        CANCELLED: 0,
      };
      for (const contact of contacts) {
        statusCounts[contact.status]++;
      }

      return NextResponse.json({
        groups,
        statusCounts,
        total: contacts.length,
      });
    }

    // Default paginated mode
    const contacts = await prisma.contact.findMany({
      where,
      include: { registration: { select: { status: true, registeredAt: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await prisma.contact.count({ where });

    return NextResponse.json({
      contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("Failed to fetch contacts:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const result = createContactSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  // Reuse ctx.event (loaded by authorizeEvent) instead of re-fetching.
  const categoryCheck = validateCategoryForEvent(
    result.data.category,
    ctx.event.categories
  );
  if (!categoryCheck.ok) {
    return NextResponse.json({ error: categoryCheck.error }, { status: 400 });
  }

  const { metadata, ...rest } = result.data;
  // Stage 1 audit-trail completion: stamp updatedBy on creation too.
  // Spec line 97 listed this but Stage 1 scoped the audit columns to
  // PUT + approvals only. This create uses the unchecked input variant
  // (raw `eventId` column rather than a nested event relation), so the
  // audit stamp also has to use the raw `updatedBy` column — Prisma's
  // create-input XORs the two variants and won't accept a mix.
  const contact = await prisma.contact.create({
    data: {
      ...rest,
      category: categoryCheck.value ?? null,
      eventId,
      inviteToken: randomBytes(16).toString("hex"),
      updatedBy: ctx.session.user.id,
      ...(metadata === null
        ? { metadata: Prisma.DbNull }
        : metadata !== undefined
        ? { metadata: metadata as Prisma.InputJsonValue }
        : {}),
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
