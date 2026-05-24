import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import {
  MAPPING_ERROR_CODES,
  checkMappingConflict,
  swapMappingSchema,
} from "@/lib/validations/field-mapping";

interface RouteParams {
  params: Promise<{ eventId: string; fieldId: string }>;
}

/**
 * Atomic swap of a single-value mapping role from one field to another.
 *
 *   URL `fieldId` — the recipient that will GAIN the role.
 *   Body         — { fromFieldId, role } — the field that currently holds
 *                  the role and the role being transferred.
 *
 * The transaction:
 *   1. Verify recipient (URL fieldId) and donor (body.fromFieldId) both
 *      exist on this event.
 *   2. Verify the donor STILL has the role we're about to lift — guards
 *      against a stale UI where another admin already moved the mapping.
 *   3. Re-run the post-change conflict check on the recipient using the
 *      already-loaded sibling set with the donor's role hypothetically
 *      cleared. This protects against type-incompatibility and FULL_NAME
 *      mutual-exclusion errors slipping past the dropdown filter.
 *   4. Two-step Prisma transaction: clear donor.mapsTo, then set
 *      recipient.mapsTo = role.
 *
 * No three-step temp-value dance is needed; mapsTo carries no unique
 * constraint at the DB level (uniqueness is app-layer per event).
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId, fieldId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const parsed = swapMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { fromFieldId, role } = parsed.data;

    if (fromFieldId === fieldId) {
      return NextResponse.json(
        { error: "fromFieldId must differ from the URL fieldId" },
        { status: 400 }
      );
    }

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

    const recipient = siblings.find((f) => f.id === fieldId);
    const donor = siblings.find((f) => f.id === fromFieldId);
    if (!recipient || !donor) {
      return NextResponse.json(
        { error: "Field not found on this event" },
        { status: 404 }
      );
    }

    if (donor.mapsTo !== role) {
      return NextResponse.json(
        {
          error: `Donor field no longer holds ${role}`,
          code: MAPPING_ERROR_CODES.SWAP_STALE,
          conflict: {
            role,
            donorActualMapping: donor.mapsTo,
          },
        },
        { status: 409 }
      );
    }

    // Hypothetical post-swap sibling set: donor's mapping is gone.
    const siblingsAfterClear = siblings.map((f) =>
      f.id === donor.id ? { ...f, mapsTo: null } : f
    );
    const check = checkMappingConflict(
      { fieldId: recipient.id, type: recipient.type, role },
      siblingsAfterClear
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

    await prisma.$transaction([
      prisma.formField.update({
        where: { id: donor.id },
        data: { mapsTo: null },
      }),
      prisma.formField.update({
        where: { id: recipient.id },
        data: { mapsTo: role },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error swapping field mapping:", error);
    return NextResponse.json(
      { error: "Failed to swap mapping" },
      { status: 500 }
    );
  }
}
