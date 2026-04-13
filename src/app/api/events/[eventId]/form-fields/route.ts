import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { FieldType, FieldWidth } from "@prisma/client";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - List all form fields for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;

    const fields = await prisma.formField.findMany({
      where: { eventId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(fields);
  } catch (error) {
    console.error("Error fetching form fields:", error);
    return NextResponse.json(
      { error: "Failed to fetch form fields" },
      { status: 500 }
    );
  }
}

// POST - Create a new form field
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json();

    // Get the highest order value for this event
    const lastField = await prisma.formField.findFirst({
      where: { eventId },
      orderBy: { order: "desc" },
    });

    const newOrder = (lastField?.order ?? -1) + 1;

    // Validate required fields
    if (!body.name || !body.label || !body.type) {
      return NextResponse.json(
        { error: "name, label, and type are required" },
        { status: 400 }
      );
    }

    // Validate type is valid
    const validTypes = Object.values(FieldType);
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid field type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const field = await prisma.formField.create({
      data: {
        eventId,
        name: body.name,
        label: body.label,
        labelAr: body.labelAr,
        type: body.type as FieldType,
        placeholder: body.placeholder,
        placeholderAr: body.placeholderAr,
        helpText: body.helpText,
        helpTextAr: body.helpTextAr,
        required: body.required ?? false,
        validation: body.validation,
        options: body.options,
        order: body.order ?? newOrder,
        width: (body.width as FieldWidth) ?? "FULL",
        section: body.section,
        conditional: body.conditional,
        isActive: body.isActive ?? true,
        isSystem: body.isSystem ?? false,
        defaultValue: body.defaultValue,
        metadata: body.metadata,
      },
    });

    return NextResponse.json(field, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating form field:", error);

    // Handle unique constraint violation
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "A field with this name already exists for this event" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create form field" },
      { status: 500 }
    );
  }
}
