import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Reorder form fields
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json();

    // Expect array of { id, order }
    if (!Array.isArray(body.fields)) {
      return NextResponse.json(
        { error: "Expected 'fields' array with { id, order } objects" },
        { status: 400 }
      );
    }

    // Update all fields in a transaction
    await prisma.$transaction(
      body.fields.map((field: { id: string; order: number }) =>
        prisma.formField.updateMany({
          where: { id: field.id, eventId },
          data: { order: field.order },
        })
      )
    );

    // Return updated fields
    const fields = await prisma.formField.findMany({
      where: { eventId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(fields);
  } catch (error) {
    console.error("Error reordering form fields:", error);
    return NextResponse.json(
      { error: "Failed to reorder form fields" },
      { status: 500 }
    );
  }
}
