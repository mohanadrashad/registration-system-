import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ eventId: string; contactId: string }>;
}

// GET — every group on the event plus THIS contact's current selections,
// in one shape the attendee detail "Groups" card can render directly.
export async function GET(_req: Request, { params }: RouteParams) {
  const { eventId, contactId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  // Cross-event guard: the contact must belong to this event.
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, eventId },
    select: { id: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const [groups, assignments] = await Promise.all([
    prisma.attendeeGroup.findMany({
      where: { eventId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        values: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, label: true, color: true },
        },
      },
    }),
    prisma.contactGroupAssignment.findMany({
      where: { contactId },
      select: { groupId: true, valueId: true },
    }),
  ]);

  const selectedByGroup = new Map<string, string[]>();
  for (const a of assignments) {
    const list = selectedByGroup.get(a.groupId) ?? [];
    list.push(a.valueId);
    selectedByGroup.set(a.groupId, list);
  }

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      allowMultiple: g.allowMultiple,
      values: g.values,
      selectedValueIds: selectedByGroup.get(g.id) ?? [],
    })),
  });
}
