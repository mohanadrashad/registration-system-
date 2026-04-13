import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { FieldType, FieldWidth } from "@prisma/client";

interface RouteParams {
  params: Promise<{ eventId: string; fieldId: string }>;
}

// GET - Get a single form field
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId, fieldId } = await params;

    const field = await prisma.formField.findFirst({
      where: { id: fieldId, eventId },
    });

    if (!field) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    return NextResponse.json(field);
  } catch (error) {
    console.error("Error fetching form field:", error);
    return NextResponse.json(
      { error: "Failed to fetch form field" },
      { status: 500 }
    );
  }
}

// PATCH - Update a form field
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId, fieldId } = await params;
    const body = await request.json();

    // Check if field exists
    const existing = await prisma.formField.findFirst({
      where: { id: fieldId, eventId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.label !== undefined) updateData.label = body.label;
    if (body.labelAr !== undefined) updateData.labelAr = body.labelAr;
    if (body.type !== undefined) {
      const validTypes = Object.values(FieldType);
      if (!validTypes.includes(body.type)) {
        return NextResponse.json({ error: "Invalid field type" }, { status: 400 });
      }
      updateData.type = body.type;
    }
    if (body.placeholder !== undefined) updateData.placeholder = body.placeholder;
    if (body.placeholderAr !== undefined) updateData.placeholderAr = body.placeholderAr;
    if (body.helpText !== undefined) updateData.helpText = body.helpText;
    if (body.helpTextAr !== undefined) updateData.helpTextAr = body.helpTextAr;
    if (body.required !== undefined) updateData.required = body.required;
    if (body.validation !== undefined) updateData.validation = body.validation;
    if (body.options !== undefined) updateData.options = body.options;
    if (body.order !== undefined) updateData.order = body.order;
    if (body.width !== undefined) {
      const validWidths = Object.values(FieldWidth);
      if (!validWidths.includes(body.width)) {
        return NextResponse.json({ error: "Invalid field width" }, { status: 400 });
      }
      updateData.width = body.width;
    }
    if (body.section !== undefined) updateData.section = body.section;
    if (body.conditional !== undefined) updateData.conditional = body.conditional;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.defaultValue !== undefined) updateData.defaultValue = body.defaultValue;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const field = await prisma.formField.update({
      where: { id: fieldId },
      data: updateData,
    });

    return NextResponse.json(field);
  } catch (error: unknown) {
    console.error("Error updating form field:", error);

    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "A field with this name already exists for this event" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update form field" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a form field
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId, fieldId } = await params;

    // Check if field exists
    const existing = await prisma.formField.findFirst({
      where: { id: fieldId, eventId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    // Prevent deletion of system fields
    if (existing.isSystem) {
      return NextResponse.json(
        { error: "System fields cannot be deleted" },
        { status: 403 }
      );
    }

    await prisma.formField.delete({
      where: { id: fieldId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting form field:", error);
    return NextResponse.json(
      { error: "Failed to delete form field" },
      { status: 500 }
    );
  }
}
