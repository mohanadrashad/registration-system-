import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getRole, canManageUsers } from "@/lib/permissions";
import { userUpdateSchema } from "@/lib/validations/user";
import bcrypt from "bcryptjs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(getRole(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = userUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email, role, password } = parsed.data;

  // Changing your own role is blocked (mirrors the self-delete guard in
  // DELETE below): a SUPER_ADMIN demoting themselves could lock user
  // management entirely. Sending the current role unchanged is fine.
  if (
    role !== undefined &&
    session.user?.id === userId &&
    role !== getRole(session)
  ) {
    return NextResponse.json(
      { error: "You cannot change your own role" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name || null;
  if (email !== undefined) data.email = email.toLowerCase();
  if (role !== undefined) data.role = role;
  if (password !== undefined) data.password = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      if (e.code === "P2002") {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        );
      }
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(getRole(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;

  // Prevent deleting yourself
  if (session.user?.id === userId) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    throw e;
  }
  return NextResponse.json({ success: true });
}
