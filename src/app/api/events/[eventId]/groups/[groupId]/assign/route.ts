import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { bulkAssignSchema } from "@/lib/validations/attendee-group";

interface RouteParams {
  params: Promise<{ eventId: string; groupId: string }>;
}

// POST — apply ONE value to many selected attendees at once.
//   set    → that value becomes the contact's value for this group
//   add    → ensure present (multi-value groups; single-value coerces to set)
//   remove → ensure absent
export async function POST(req: Request, { params }: RouteParams) {
  const { eventId, groupId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;
  const userId = ctx.session.user.id;

  const raw = await req.json().catch(() => null);
  const parsed = bulkAssignSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { valueId } = parsed.data;
  let mode = parsed.data.mode;

  // Group ∈ event, and the value ∈ group.
  const group = await prisma.attendeeGroup.findFirst({
    where: { id: groupId, eventId },
    select: { id: true, allowMultiple: true, values: { select: { id: true } } },
  });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  if (!group.values.some((v) => v.id === valueId)) {
    return NextResponse.json(
      { error: "Value does not belong to this group" },
      { status: 400 }
    );
  }
  // A single-value group can't stack, so "add" means "set".
  if (!group.allowMultiple && mode === "add") mode = "set";

  // Scope the contact ids to this event — foreign ids silently drop out.
  const valid = await prisma.contact.findMany({
    where: { id: { in: parsed.data.contactIds }, eventId },
    select: { id: true },
  });
  const contactIds = valid.map((c) => c.id);
  if (contactIds.length === 0) {
    return NextResponse.json({ affected: 0 });
  }

  if (mode === "remove") {
    const res = await prisma.contactGroupAssignment.deleteMany({
      where: { groupId, valueId, contactId: { in: contactIds } },
    });
    return NextResponse.json({ affected: res.count });
  }

  if (mode === "set") {
    // Replace each contact's values in this group with [valueId], atomically.
    await prisma.$transaction([
      prisma.contactGroupAssignment.deleteMany({
        where: { groupId, contactId: { in: contactIds } },
      }),
      prisma.contactGroupAssignment.createMany({
        data: contactIds.map((contactId) => ({
          contactId,
          groupId,
          valueId,
          createdBy: userId,
        })),
        skipDuplicates: true,
      }),
    ]);
    return NextResponse.json({ affected: contactIds.length });
  }

  // mode === "add" (multi-value group): ensure the value is present.
  const res = await prisma.contactGroupAssignment.createMany({
    data: contactIds.map((contactId) => ({
      contactId,
      groupId,
      valueId,
      createdBy: userId,
    })),
    skipDuplicates: true,
  });
  return NextResponse.json({ affected: res.count });
}
