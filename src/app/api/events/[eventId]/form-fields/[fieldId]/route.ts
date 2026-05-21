import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/api-auth";
import { FieldType, FieldWidth } from "@prisma/client";
import { FIELD_TYPES } from "@/lib/form-builder/field-types";
import { fieldOptionsArrayUniqueSchema } from "@/lib/validations/form-field";
import { findReferencedOptionValues } from "@/lib/form-builder/option-value-lock";

interface RouteParams {
  params: Promise<{ eventId: string; fieldId: string }>;
}

// GET - Get a single form field
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await authorize();
    if (ctx instanceof NextResponse) return ctx;

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
    const ctx = await authorize("editor");
    if (ctx instanceof NextResponse) return ctx;

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
    if (body.options !== undefined) {
      // Validate shape (every entry has a value+label, values unique).
      const parsed = fieldOptionsArrayUniqueSchema.safeParse(body.options);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Invalid options",
            details: parsed.error.flatten(),
          },
          { status: 400 }
        );
      }

      // Value-lock guard — only meaningful for option-bearing field
      // types. For non-option types the `options` column is ignored by
      // the renderer anyway, but we let the write through (existing
      // admin tooling may pass an empty array for cleanup).
      const fieldTypeForLock = (updateData.type as FieldType | undefined) ?? existing.type;
      if (FIELD_TYPES[fieldTypeForLock]?.hasOptions) {
        const oldOptions = Array.isArray(existing.options)
          ? (existing.options as Array<{ value?: unknown }>)
          : [];
        const oldValues = new Set(
          oldOptions
            .map((o) => o?.value)
            .filter((v): v is string => typeof v === "string")
        );
        const newValues = new Set(parsed.data.map((o) => o.value));
        const removed = [...oldValues].filter((v) => !newValues.has(v));

        if (removed.length > 0) {
          const inUse = await findReferencedOptionValues({
            eventId,
            fieldName: existing.name,
            fieldType: fieldTypeForLock,
            removedValues: removed,
          });

          if (inUse.length > 0) {
            const lines = inUse
              .map(
                (u) =>
                  `  • "${u.value}" — ${u.registrationCount} registration${
                    u.registrationCount === 1 ? "" : "s"
                  }`
              )
              .join("\n");
            return NextResponse.json(
              {
                error:
                  `Cannot remove or rename ${
                    inUse.length === 1 ? "this option" : "these options"
                  } because ${
                    inUse.length === 1 ? "it is" : "they are"
                  } referenced by existing registrations:\n${lines}\n\nLabels can still be edited freely — only the value is locked.`,
                lockedValues: inUse,
              },
              { status: 409 }
            );
          }
        }
      }

      updateData.options = parsed.data;
    }
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
    const ctx = await authorize("editor");
    if (ctx instanceof NextResponse) return ctx;

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
