import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { FieldMapping } from "@prisma/client";
import { FIELD_MAPPING_LEGACY_KEYS } from "@/lib/form-builder/field-mapping-labels";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

interface FieldRef {
  id: string;
  name: string;
  label: string;
}

type SingleValueRole = Exclude<FieldMapping, "FULL_NAME">;

interface MappingSummary {
  mappings: {
    FIRST_NAME: { fields: FieldRef[]; legacy: string };
    LAST_NAME: { fields: FieldRef[]; legacy: string };
    EMAIL: { fields: FieldRef[]; legacy: string };
    PHONE: { fields: FieldRef[]; legacy: string };
    ORGANIZATION: { fields: FieldRef[]; legacy: string };
    DESIGNATION: { fields: FieldRef[]; legacy: string };
    FULL_NAME: { field: FieldRef | null };
  };
}

/**
 * Read-only data for the form-builder summary card. Returns one entry
 * per FieldMapping role:
 *
 *   - Single-value roles (everything except FULL_NAME) return an array
 *     of tagged fields plus the legacy formData key the resolver falls
 *     back to when the array is empty. The array is ordered by
 *     FormField.order so the UI can render LAST_NAME's join order
 *     deterministically.
 *   - FULL_NAME returns a single field or null (it's single-value and
 *     the UI collapses two rows into one when set).
 *
 * editor role gates this — the form-builder caller already requires
 * editor to render, so callers always pass.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

    const taggedFields = await prisma.formField.findMany({
      where: { eventId, mapsTo: { not: null } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, label: true, mapsTo: true },
    });

    const groupSingle: Record<SingleValueRole, FieldRef[]> = {
      FIRST_NAME: [],
      LAST_NAME: [],
      EMAIL: [],
      PHONE: [],
      ORGANIZATION: [],
      DESIGNATION: [],
    };
    let fullName: FieldRef | null = null;

    for (const f of taggedFields) {
      if (f.mapsTo === null) continue;
      const ref: FieldRef = { id: f.id, name: f.name, label: f.label };
      if (f.mapsTo === "FULL_NAME") {
        // Validator enforces single-value, but if drift sneaks in we
        // keep the first occurrence (orderBy order asc above) so the UI
        // renders something instead of crashing.
        if (!fullName) fullName = ref;
      } else {
        groupSingle[f.mapsTo].push(ref);
      }
    }

    const response: MappingSummary = {
      mappings: {
        FIRST_NAME: {
          fields: groupSingle.FIRST_NAME,
          legacy: FIELD_MAPPING_LEGACY_KEYS.FIRST_NAME,
        },
        LAST_NAME: {
          fields: groupSingle.LAST_NAME,
          legacy: FIELD_MAPPING_LEGACY_KEYS.LAST_NAME,
        },
        EMAIL: {
          fields: groupSingle.EMAIL,
          legacy: FIELD_MAPPING_LEGACY_KEYS.EMAIL,
        },
        PHONE: {
          fields: groupSingle.PHONE,
          legacy: FIELD_MAPPING_LEGACY_KEYS.PHONE,
        },
        ORGANIZATION: {
          fields: groupSingle.ORGANIZATION,
          legacy: FIELD_MAPPING_LEGACY_KEYS.ORGANIZATION,
        },
        DESIGNATION: {
          fields: groupSingle.DESIGNATION,
          legacy: FIELD_MAPPING_LEGACY_KEYS.DESIGNATION,
        },
        FULL_NAME: { field: fullName },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching field mapping summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch field mapping summary" },
      { status: 500 }
    );
  }
}
