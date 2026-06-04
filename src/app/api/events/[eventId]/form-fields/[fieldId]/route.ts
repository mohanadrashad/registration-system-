import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { FieldType, FieldWidth } from "@prisma/client";
import { FIELD_TYPES } from "@/lib/form-builder/field-types";
import {
  fieldOptionsInputSchema,
  optionColumnsSchema,
} from "@/lib/validations/form-field";
import { validateFileFieldMetadataInput } from "@/lib/validations/file-field-metadata";
import {
  checkMappingConflict,
  mapsToInputSchema,
} from "@/lib/validations/field-mapping";
import { findReferencedOptionValues } from "@/lib/form-builder/option-value-lock";
import {
  parseFormFieldOptions,
  serializeFormFieldOptions,
} from "@/lib/form-builder/options-parse";

interface RouteParams {
  params: Promise<{ eventId: string; fieldId: string }>;
}

// GET - Get a single form field
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId, fieldId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "authenticated" });
    if (ctx instanceof NextResponse) return ctx;

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
    const { eventId, fieldId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

    // Check if field exists
    const existing = await prisma.formField.findFirst({
      where: { id: fieldId, eventId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    // Email-required lock: when this is the system email field AND the
    // self-service portal module is on, `required` cannot be unset. The
    // form-builder UI gates this client-side; this is defense in depth
    // against direct API calls. Lookup only runs when relevant.
    if (
      existing.name === "email" &&
      body.required !== undefined &&
      body.required !== true
    ) {
      const modules = await prisma.eventModules.findUnique({
        where: { eventId },
        select: { selfServicePortal: true },
      });
      if (modules?.selfServicePortal) {
        return NextResponse.json(
          {
            error:
              "Email field is required while the self-service portal module is enabled. Disable the portal to make email optional.",
            code: "EMAIL_REQUIRED_BY_PORTAL",
          },
          { status: 400 }
        );
      }
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
      // Accepts legacy array or wrapped { options, other?, maxSelections? }.
      const parsed = fieldOptionsInputSchema.safeParse(body.options);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Invalid options",
            details: parsed.error.flatten(),
          },
          { status: 400 }
        );
      }
      const normalizedNew = parseFormFieldOptions(parsed.data);

      // Value-lock guard — only meaningful for option-bearing field
      // types. For non-option types the `options` column is ignored by
      // the renderer anyway, but we let the write through (existing
      // admin tooling may pass an empty array for cleanup).
      const fieldTypeForLock = (updateData.type as FieldType | undefined) ?? existing.type;
      if (FIELD_TYPES[fieldTypeForLock]?.hasOptions) {
        const normalizedOld = parseFormFieldOptions(existing.options);
        const oldValues = new Set(normalizedOld.options.map((o) => o.value));
        const newValues = new Set(normalizedNew.options.map((o) => o.value));
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

      updateData.options = serializeFormFieldOptions(normalizedNew);
    }
    if (body.order !== undefined) updateData.order = body.order;
    if (body.width !== undefined) {
      const validWidths = Object.values(FieldWidth);
      if (!validWidths.includes(body.width)) {
        return NextResponse.json({ error: "Invalid field width" }, { status: 400 });
      }
      updateData.width = body.width;
    }
    if (body.optionColumns !== undefined) {
      const parsed = optionColumnsSchema.safeParse(body.optionColumns);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid option columns" },
          { status: 400 }
        );
      }
      updateData.optionColumns = parsed.data;
    }
    if (body.section !== undefined) updateData.section = body.section;
    if (body.conditional !== undefined) updateData.conditional = body.conditional;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.defaultValue !== undefined) updateData.defaultValue = body.defaultValue;
    if (body.metadata !== undefined) {
      // Type-scoped validation: only FILE owns a metadata schema today.
      // Effective type = body.type if changing, else the existing row.
      // `null` is "clear the column" (used on FILE → other-type
      // transitions to drop stale FILE keys) and always passes.
      const effectiveType =
        (body.type as FieldType | undefined) ?? existing.type;
      if (effectiveType === "FILE" && body.metadata !== null) {
        const check = validateFileFieldMetadataInput(body.metadata);
        if (!check.ok) {
          return NextResponse.json({ error: check.message }, { status: 400 });
        }
      }
      updateData.metadata = body.metadata;
    }

    // Field mapping (`mapsTo`). The check fires when EITHER the mapping
    // OR the field type is changing, so that flipping a tagged field's
    // type to something incompatible is caught from either direction
    // (mirrors the option-value-lock pattern above). When neither
    // changes, the lookup of sibling fields is skipped.
    if (body.mapsTo !== undefined || body.type !== undefined) {
      const parsedMapsTo = mapsToInputSchema.safeParse(body.mapsTo);
      if (!parsedMapsTo.success) {
        return NextResponse.json(
          {
            error: "Invalid mapsTo value",
            details: parsedMapsTo.error.flatten(),
          },
          { status: 400 }
        );
      }
      const effectiveType =
        (updateData.type as FieldType | undefined) ?? existing.type;
      const effectiveMapsTo =
        parsedMapsTo.data !== undefined ? parsedMapsTo.data : existing.mapsTo;

      if (effectiveMapsTo !== null) {
        const siblings = await prisma.formField.findMany({
          where: { eventId },
          select: {
            id: true,
            name: true,
            label: true,
            type: true,
            mapsTo: true,
          },
        });
        const check = checkMappingConflict(
          {
            fieldId: existing.id,
            type: effectiveType,
            role: effectiveMapsTo,
          },
          siblings
        );
        if (!check.ok) {
          return NextResponse.json(
            {
              error: check.message,
              code: check.code,
              conflict: check.conflict,
            },
            { status: check.status }
          );
        }
      }

      if (parsedMapsTo.data !== undefined) {
        updateData.mapsTo = parsedMapsTo.data;
      }
    }

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
    const { eventId, fieldId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

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
