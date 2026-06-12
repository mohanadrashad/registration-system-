import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Reorder form fields
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json().catch(() => null);

    // Expect array of { id, order }
    if (!body || !Array.isArray(body.fields)) {
      return NextResponse.json(
        { error: "Expected 'fields' array with { id, order } objects" },
        { status: 400 }
      );
    }

    const entries: { id: string; order: number }[] = body.fields;
    const valid = entries.every(
      (f) =>
        f &&
        typeof f.id === "string" &&
        typeof f.order === "number" &&
        Number.isInteger(f.order) &&
        f.order >= 0
    );
    if (!valid) {
      return NextResponse.json(
        { error: "Each field entry needs a string 'id' and a non-negative integer 'order'" },
        { status: 400 }
      );
    }
    // Duplicate ids or orders would silently produce an unstable sort.
    if (
      new Set(entries.map((f) => f.id)).size !== entries.length ||
      new Set(entries.map((f) => f.order)).size !== entries.length
    ) {
      return NextResponse.json(
        { error: "Duplicate field ids or order values in reorder payload" },
        { status: 400 }
      );
    }

    // Update all fields in a transaction
    await prisma.$transaction(
      entries.map((field) =>
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
