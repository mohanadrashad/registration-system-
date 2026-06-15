import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { setContactGroupValuesSchema } from "@/lib/validations/attendee-group";

interface RouteParams {
  params: Promise<{ eventId: string; contactId: string; groupId: string }>;
}

// PUT — set THIS contact's values for ONE group ("set" semantics: the
// submitted list becomes the complete set; empty clears the group).
// Single-value groups reject more than one value.
export async function PUT(req: Request, { params }: RouteParams) {
  const { eventId, contactId, groupId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;
  const userId = ctx.session.user.id;

  const raw = await req.json().catch(() => null);
  const parsed = setContactGroupValuesSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const valueIds = [...new Set(parsed.data.valueIds)];

  // Scope the whole chain: contact ∈ event, group ∈ event, and every
  // submitted value ∈ group. Fetch group with its value ids in one go.
  const [contact, group] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, eventId },
      select: { id: true },
    }),
    prisma.attendeeGroup.findFirst({
      where: { id: groupId, eventId },
      select: { id: true, allowMultiple: true, values: { select: { id: true } } },
    }),
  ]);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  if (!group.allowMultiple && valueIds.length > 1) {
    return NextResponse.json(
      { error: "This group accepts only one value per attendee" },
      { status: 400 }
    );
  }

  const groupValueIds = new Set(group.values.map((v) => v.id));
  for (const id of valueIds) {
    if (!groupValueIds.has(id)) {
      return NextResponse.json(
        { error: "One or more values don't belong to this group" },
        { status: 400 }
      );
    }
  }

  // Replace this group's assignments for the contact atomically.
  await prisma.$transaction([
    prisma.contactGroupAssignment.deleteMany({ where: { contactId, groupId } }),
    ...(valueIds.length
      ? [
          prisma.contactGroupAssignment.createMany({
            data: valueIds.map((valueId) => ({
              contactId,
              groupId,
              valueId,
              createdBy: userId,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ groupId, selectedValueIds: valueIds });
}
