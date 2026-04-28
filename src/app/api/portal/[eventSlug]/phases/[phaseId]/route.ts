import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computePhaseStatus } from "@/lib/services/phase.service";
import { isFieldRequiredByCondition } from "@/lib/form-conditional";
import { getPortalSessionFromRequest } from "@/lib/portal/session";

interface RouteParams {
  params: Promise<{ eventSlug: string; phaseId: string }>;
}

/**
 * Authenticate via the portal_session cookie and confirm the phase
 * belongs to the authenticated attendee's event with the postRegPhases
 * module on.
 */
async function loadAuthorizedContext(
  req: NextRequest,
  eventSlug: string,
  phaseId: string
) {
  const session = await getPortalSessionFromRequest(req, eventSlug);
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
    } as const;
  }

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    include: { modules: true, branding: true },
  });
  if (!event || !event.isActive) {
    return {
      error: NextResponse.json({ error: "Event not found" }, { status: 404 }),
    } as const;
  }
  if (!event.modules?.selfServicePortal) {
    return {
      error: NextResponse.json(
        { error: "Self-service portal is not enabled for this event" },
        { status: 403 }
      ),
    } as const;
  }
  if (!event.modules.postRegPhases) {
    return {
      error: NextResponse.json(
        { error: "Post-registration phases are not enabled for this event" },
        { status: 403 }
      ),
    } as const;
  }

  const registration = await prisma.registration.findFirst({
    where: { id: session.registrationId, eventId: event.id },
    select: { id: true, status: true },
  });
  if (!registration) {
    return {
      error: NextResponse.json(
        { error: "Session is no longer valid. Please log in again." },
        { status: 401 }
      ),
    } as const;
  }

  const phase = await prisma.phase.findFirst({
    where: {
      id: phaseId,
      eventId: event.id,
      type: "POST_REGISTRATION",
      isActive: true,
    },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: { order: "asc" },
          },
        },
      },
      accessOverrides: {
        where: { registrationId: registration.id },
        select: { status: true },
      },
      submissions: {
        where: { registrationId: registration.id },
        select: { id: true, data: true, submittedAt: true, updatedAt: true },
      },
    },
  });
  if (!phase) {
    return {
      error: NextResponse.json({ error: "Phase not found" }, { status: 404 }),
    } as const;
  }

  return { event, registration, phase } as const;
}

// GET — fetch the phase structure + any existing submission for this attendee.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventSlug, phaseId } = await params;

  const ctx = await loadAuthorizedContext(req, eventSlug, phaseId);
  if ("error" in ctx) return ctx.error;
  const { phase, event } = ctx;

  const override = phase.accessOverrides[0]?.status ?? null;
  const status = computePhaseStatus(phase, override, new Date());

  return NextResponse.json({
    event: {
      name: event.name,
      slug: eventSlug,
      branding: event.branding ?? null,
    },
    phase: {
      id: phase.id,
      title: phase.title,
      titleAr: phase.titleAr,
      description: phase.description,
      descriptionAr: phase.descriptionAr,
      opensAt: phase.opensAt,
      closesAt: phase.closesAt,
      isRequired: phase.isRequired,
      status,
      steps: phase.steps.map((s) => ({
        id: s.id,
        title: s.title,
        titleAr: s.titleAr,
        description: s.description,
        descriptionAr: s.descriptionAr,
        order: s.order,
        fields: s.fields.map((f) => ({
          id: f.id,
          name: f.name,
          label: f.label,
          labelAr: f.labelAr,
          type: f.type,
          placeholder: f.placeholder,
          placeholderAr: f.placeholderAr,
          helpText: f.helpText,
          helpTextAr: f.helpTextAr,
          required: f.required,
          validation: f.validation,
          options: f.options,
          order: f.order,
          width: f.width,
          conditional: f.conditional,
          isSystem: f.isSystem,
          defaultValue: f.defaultValue,
        })),
      })),
    },
    submission: phase.submissions[0]
      ? {
          data: phase.submissions[0].data,
          submittedAt: phase.submissions[0].submittedAt,
          updatedAt: phase.submissions[0].updatedAt,
        }
      : null,
  });
}

// PUT — create or update the phase submission for this attendee.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { eventSlug, phaseId } = await params;
  const body = await req.json();
  const { data } = body as {
    data?: Record<string, unknown>;
  };

  const ctx = await loadAuthorizedContext(req, eventSlug, phaseId);
  if ("error" in ctx) return ctx.error;
  const { phase, registration } = ctx;

  if (!data || typeof data !== "object") {
    return NextResponse.json(
      { error: "Submission data missing" },
      { status: 400 }
    );
  }

  const override = phase.accessOverrides[0]?.status ?? null;
  const status = computePhaseStatus(phase, override, new Date());
  if (status !== "OPEN") {
    return NextResponse.json(
      { error: `This phase is ${status.toLowerCase().replace("_", " ")}.` },
      { status: 403 }
    );
  }

  const allFields = phase.steps.flatMap((s) => s.fields);
  for (const f of allFields) {
    if (!f.required) continue;
    if (!isFieldRequiredByCondition(f.conditional, data)) continue;
    const v = data[f.name];
    if (v === undefined || v === null || v === "") {
      return NextResponse.json(
        { error: `${f.label} is required` },
        { status: 400 }
      );
    }
  }

  const upserted = await prisma.phaseSubmission.upsert({
    where: {
      phaseId_registrationId: {
        phaseId: phase.id,
        registrationId: registration.id,
      },
    },
    update: { data: data as Prisma.InputJsonValue },
    create: {
      phaseId: phase.id,
      registrationId: registration.id,
      data: data as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    success: true,
    submission: {
      id: upserted.id,
      submittedAt: upserted.submittedAt,
      updatedAt: upserted.updatedAt,
    },
  });
}
