import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computePhaseStatus } from "@/lib/services/phase.service";
import { computePhaseCompletion } from "@/lib/services/selection.service";
import { getPortalSessionFromRequest } from "@/lib/portal/session";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

const COLUMN_FIELDS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
]);

const LAYOUT_TYPES = new Set(["HEADING", "DIVIDER", "PARAGRAPH", "HIDDEN"]);

// GET - Get the authenticated attendee's registration. Requires a valid
// portal_session cookie (set by POST /api/portal/[eventSlug]/login).
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { eventSlug } = await params;

    const session = await getPortalSessionFromRequest(req, eventSlug);
    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      include: {
        modules: true,
        branding: true,
        // Edit-your-details panel scopes to REGISTRATION-phase fields only;
        // post-reg phase fields live behind their own UI.
        formFields: {
          where: {
            isActive: true,
            step: { phase: { type: "REGISTRATION" } },
          },
          orderBy: { order: "asc" },
          select: {
            name: true,
            label: true,
            labelAr: true,
            type: true,
            options: true,
            required: true,
            isSystem: true,
          },
        },
      },
    });

    if (!event || !event.isActive) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.modules?.selfServicePortal) {
      return NextResponse.json(
        { error: "Self-service portal is not enabled for this event" },
        { status: 403 }
      );
    }

    const registration = await prisma.registration.findFirst({
      where: { id: session.registrationId, eventId: event.id },
      include: { contact: true, badge: true },
    });

    if (!registration) {
      // Session points at a registration that's been deleted, or the
      // session is stale. Treat as logged-out.
      return NextResponse.json(
        { error: "Session is no longer valid. Please log in again." },
        { status: 401 }
      );
    }

    // Post-registration phases — only surface them when the module is on.
    // For each phase: include status (LOCKED / NOT_OPEN / OPEN / CLOSED),
    // any existing submission, and overlay "completed" via submittedAt.
    let phases: Array<Record<string, unknown>> = [];
    if (event.modules?.postRegPhases) {
      const phaseRows = await prisma.phase.findMany({
        where: {
          eventId: event.id,
          type: "POST_REGISTRATION",
          isActive: true,
        },
        orderBy: { order: "asc" },
        include: {
          accessOverrides: {
            where: { registrationId: registration.id },
            select: { status: true },
          },
          submissions: {
            where: { registrationId: registration.id },
            select: { id: true, submittedAt: true, updatedAt: true },
          },
          // Stage 4: options + this attendee's selections needed to
          // compute the four-state completion status. Pulled here so
          // the portal home renders the right badge without an extra
          // round-trip per phase.
          options: {
            select: { id: true, requiresReceipt: true },
          },
          selections: {
            where: { registrationId: registration.id },
            select: {
              optionId: true,
              source: true,
              receiptFileId: true,
            },
          },
          steps: {
            select: {
              fields: {
                where: { isActive: true },
                select: { required: true },
              },
            },
          },
        },
      });

      const now = new Date();
      phases = phaseRows
        .map((p) => {
          const override = p.accessOverrides[0]?.status ?? null;
          const status = computePhaseStatus(p, override, now);
          const submission = p.submissions[0] ?? null;
          // Stage 2: per-category visibility. A phase with no category
          // restriction is universal; otherwise the attendee's category
          // must be listed. A PhaseAccess override (OPEN or LOCKED) is
          // an explicit per-attendee admin decision and wins over the
          // category filter (open question #5 default).
          const hasOverride = override === "OPEN" || override === "LOCKED";
          const attendeeCategory = registration.contact.category;
          const categoryApplies =
            p.appliesToCategories.length === 0 ||
            (attendeeCategory != null &&
              p.appliesToCategories.includes(attendeeCategory));
          if (!hasOverride && !categoryApplies) return null;
          // Closed-without-submission phases are hidden per spec.
          if (status === "CLOSED" && !submission) return null;
          // Field completion proxy: any required field implies the
          // submission must exist for "fields satisfied"; if there are
          // no required fields the phase is fields-satisfied by default.
          const hasRequiredFields = p.steps.some((st) =>
            st.fields.some((f) => f.required)
          );
          const fieldsSatisfied = hasRequiredFields
            ? !!submission
            : true;
          const completionStatus = computePhaseCompletion(
            {
              selectionMode: p.selectionMode,
              maxSelections: p.maxSelections,
              isRequired: p.isRequired,
              requiresReceiptUpload: p.requiresReceiptUpload,
            },
            p.options,
            p.selections,
            fieldsSatisfied
          );
          return {
            id: p.id,
            title: p.title,
            titleAr: p.titleAr,
            description: p.description,
            descriptionAr: p.descriptionAr,
            order: p.order,
            opensAt: p.opensAt,
            closesAt: p.closesAt,
            isRequired: p.isRequired,
            status,
            submittedAt: submission?.submittedAt ?? null,
            updatedAt: submission?.updatedAt ?? null,
            // Kept for back-compat with existing portal home UI;
            // true when phase is COMPLETE.
            isCompleted: completionStatus === "COMPLETE",
            completionStatus,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }

    return NextResponse.json({
      event: {
        name: event.name,
        description: event.description,
        venue: event.venue,
        startDate: event.startDate,
        endDate: event.endDate,
        branding: event.branding,
        formFields: event.formFields,
        // Surfaced so the page can show / hide the language toggle.
        // Arabic variants on form fields and phases are returned
        // unconditionally; this flag just gates the UI.
        multiLanguage: event.modules?.multiLanguage ?? false,
      },
      registration: {
        id: registration.id,
        status: registration.status,
        confirmationCode: registration.confirmationCode,
        registeredAt: registration.registeredAt,
        badgeGenerated: registration.badgeGenerated,
        badgeUrl: registration.badgeUrl,
      },
      contact: {
        firstName: registration.contact.firstName,
        lastName: registration.contact.lastName,
        email: registration.contact.email,
        phone: registration.contact.phone,
        organization: registration.contact.organization,
        designation: registration.contact.designation,
        metadata: registration.contact.metadata,
      },
      phases,
    });
  } catch (error) {
    console.error("Portal lookup error:", error);
    return NextResponse.json(
      { error: "Failed to lookup registration" },
      { status: 500 }
    );
  }
}

// POST - Update the authenticated attendee's registration (edit details or
// cancel). Identity comes from the portal_session cookie.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { eventSlug } = await params;

    const session = await getPortalSessionFromRequest(req, eventSlug);
    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { updates, action } = body;

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      include: {
        modules: true,
        formFields: {
          where: {
            isActive: true,
            step: { phase: { type: "REGISTRATION" } },
          },
          select: { name: true, type: true, required: true, label: true },
        },
      },
    });

    if (!event || !event.isActive) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.modules?.selfServicePortal) {
      return NextResponse.json(
        { error: "Self-service portal is not enabled" },
        { status: 403 }
      );
    }

    const registration = await prisma.registration.findFirst({
      where: { id: session.registrationId, eventId: event.id },
      include: { contact: true },
    });

    if (!registration) {
      return NextResponse.json(
        { error: "Session is no longer valid. Please log in again." },
        { status: 401 }
      );
    }

    if (action === "cancel") {
      if (registration.status === "CANCELLED") {
        return NextResponse.json(
          { error: "Registration is already cancelled" },
          { status: 400 }
        );
      }

      await prisma.registration.update({
        where: { id: registration.id },
        data: { status: "CANCELLED" },
      });

      await prisma.contact.update({
        where: { id: registration.contactId },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json({
        success: true,
        message: "Registration cancelled successfully",
      });
    }

    if (updates && typeof updates === "object") {
      const allowedNames = new Set(
        (event.formFields || [])
          .filter((f) => !LAYOUT_TYPES.has(f.type) && f.name !== "email")
          .map((f) => f.name)
      );

      for (const field of event.formFields || []) {
        if (!field.required || LAYOUT_TYPES.has(field.type) || field.name === "email") continue;
        const v = (updates as Record<string, unknown>)[field.name];
        if (v === undefined || v === null || v === "") {
          return NextResponse.json(
            { error: `${field.label} is required` },
            { status: 400 }
          );
        }
      }

      const columnUpdates: Record<string, unknown> = {};
      const existingMetadata = (registration.contact.metadata as Record<string, unknown>) || {};
      const metadataUpdates: Record<string, unknown> = { ...existingMetadata };

      for (const [name, value] of Object.entries(updates as Record<string, unknown>)) {
        if (!allowedNames.has(name)) continue;
        if (COLUMN_FIELDS.has(name)) {
          columnUpdates[name] = value === "" || value === undefined ? null : value;
        } else {
          metadataUpdates[name] = value;
        }
      }

      const data: Prisma.ContactUpdateInput = { ...columnUpdates };
      if (Object.keys(metadataUpdates).length > 0) {
        data.metadata = metadataUpdates as Prisma.InputJsonValue;
      }

      if (Object.keys(data).length > 0) {
        await prisma.contact.update({
          where: { id: registration.contactId },
          data,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Details updated successfully",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Portal update error:", error);
    return NextResponse.json(
      { error: "Failed to update registration" },
      { status: 500 }
    );
  }
}
