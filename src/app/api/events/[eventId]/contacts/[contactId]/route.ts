import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateContactSchema } from "@/lib/validations/contact";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contactId } = await params;
  const body = await req.json();
  const result = updateContactSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const contact = await prisma.contact.update({
    where: { id: contactId },
    data: result.data,
  });

  return NextResponse.json(contact);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contactId } = await params;
  await prisma.contact.delete({ where: { id: contactId } });

  return NextResponse.json({ success: true });
}
