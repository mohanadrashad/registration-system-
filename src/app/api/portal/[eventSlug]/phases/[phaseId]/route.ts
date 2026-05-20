import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computePhaseStatus } from "@/lib/services/phase.service";
import { isFieldRequiredByCondition } from "@/lib/form-conditional";
import { getPortalSessionFromRequest } from "@/lib/portal/session";
import { submitPhasePortalSchema } from "@/lib/validations/selection";
import {
  computePhaseCompletion,
  OptionFullError,
  OptionInactiveError,
  OptionsCrossPhaseError,
  PhaseNotFoundForSelectionError,
  readOptionCountSummary,
  SelectionDuplicateError,
  SelectionModeNotWritableError,
  SelectionsAdminLockedError,
  SelectionsConcurrencyError,
  SelectionsLockedError,
  submitAttendeeSelectionsInTx,
  TooManySelectionsError,
} from "@/lib/services/selection.service";

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
    select: {
      id: true,
      status: true,
      contact: { select: { category: true } },
    },
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
      // Stage 3: include options with capacity counts and the attendee's
      // current selections. We strip notes from the selections in the
      // response — they're admin-only.
      options: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          label: true,
          labelAr: true,
          description: true,
          descriptionAr: true,
          externalUrl: true,
          capacity: true,
          metadata: true,
          requiresReceipt: true,
          // Category-Phases stage 3 — per-option receipt copy. Rendered
          // above the file picker on the upload control when present.
          receiptLabel: true,
          receiptInstructions: true,
          receiptLabelAr: true,
          receiptInstructionsAr: true,
          isActive: true,
          order: true,
          updatedAt: true,
          _count: { select: { selections: true } },
        },
      },
      selections: {
        where: { registrationId: registration.id },
        select: {
          id: true,
          optionId: true,
          source: true,
          assignedAt: true,
          updatedAt: true,
          // notes: deliberately omitted — admin-only.
          receiptFileId: true,
          // Stage 4: include receipt metadata for the portal UI.
          // Never include blobUrl or blobPath — those are server-only.
          receipt: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });
  if (!phase) {
    return {
      error: NextResponse.json({ error: "Phase not found" }, { status: 404 }),
    } as const;
  }

  // Stage 2: per-category visibility. If the phase is restricted and the
  // attendee's category isn't listed, it doesn't apply — return the
  // same 404 as a missing phase (don't leak that it exists). A
  // PhaseAccess override (OPEN or LOCKED) is an explicit per-attendee
  // admin decision and wins over the category filter (open Q5 default).
  const override = phase.accessOverrides[0]?.status ?? null;
  const hasOverride = override === "OPEN" || override === "LOCKED";
  const attendeeCategory = registration.contact.category;
  const categoryApplies =
    phase.appliesToCategories.length === 0 ||
    (attendeeCategory != null &&
      phase.appliesToCategories.includes(attendeeCategory));
  if (!hasOverride && !categoryApplies) {
    return {
      error: NextResponse.json({ error: "Phase not found" }, { status: 404 }),
    } as const;
  }

  return { event, registration, phase, eventSlug } as const;
}

// GET — fetch the phase structure + any existing submission + selection state.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventSlug, phaseId } = await params;

  const ctx = await loadAuthorizedContext(req, eventSlug, phaseId);
  if ("error" in ctx) return ctx.error;
  const { phase, event } = ctx;

  const override = phase.accessOverrides[0]?.status ?? null;
  const status = computePhaseStatus(phase, override, new Date());

  // Compute the concurrency token: max(updatedAt) across this attendee's
  // existing selections, or null on first-time. Client echoes this back
  // on submit so the server can detect concurrent edits.
  const selectionsUpdatedAt =
    phase.selections.length === 0
      ? null
      : new Date(
          Math.max(
            ...phase.selections.map((s) => s.updatedAt.getTime())
          )
        ).toISOString();

  return NextResponse.json({
    event: {
      name: event.name,
      slug: eventSlug,
      branding: event.branding ?? null,
      // Surfaced so the page can decide whether to render the language
      // toggle. The Arabic counterparts (titleAr, labelAr, …) are always
      // present in the payload regardless; the flag just gates the UI.
      multiLanguage: event.modules?.multiLanguage ?? false,
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
      // Stage 3 fields
      selectionMode: phase.selectionMode,
      maxSelections: phase.maxSelections,
      allowChangeAfterSubmit: phase.allowChangeAfterSubmit,
      requiresReceiptUpload: phase.requiresReceiptUpload,
      options: phase.options.map((o) => ({
        id: o.id,
        label: o.label,
        labelAr: o.labelAr,
        description: o.description,
        descriptionAr: o.descriptionAr,
        externalUrl: o.externalUrl,
        capacity: o.capacity,
        metadata: o.metadata,
        requiresReceipt: o.requiresReceipt,
        receiptLabel: o.receiptLabel,
        receiptInstructions: o.receiptInstructions,
        receiptLabelAr: o.receiptLabelAr,
        receiptInstructionsAr: o.receiptInstructionsAr,
        isActive: o.isActive,
        order: o.order,
        taken: o._count.selections,
        full:
          o.capacity != null && o._count.selections >= o.capacity,
      })),
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
    selections: phase.selections.map((s) => ({
      id: s.id,
      optionId: s.optionId,
      source: s.source,
      assignedAt: s.assignedAt,
      updatedAt: s.updatedAt,
      hasReceipt: !!s.receiptFileId,
      // Stage 4 receipt metadata. Never includes blobUrl/blobPath —
      // those stay server-side. Client uses receipt.id to call the
      // stream-through endpoint when viewing.
      receipt: s.receipt
        ? {
            id: s.receipt.id,
            originalName: s.receipt.originalName,
            mimeType: s.receipt.mimeType,
            sizeBytes: s.receipt.sizeBytes,
            uploadedAt: s.receipt.uploadedAt,
          }
        : null,
    })),
    selectionsUpdatedAt,
    submission: phase.submissions[0]
      ? {
          data: phase.submissions[0].data,
          submittedAt: phase.submissions[0].submittedAt,
          updatedAt: phase.submissions[0].updatedAt,
        }
      : null,
    // Stage 4 completion status. Derived from selections + receipts +
    // field-data presence. The portal uses this to decide whether to
    // show the receipt-required CTA or the "all done" state.
    completionStatus: computePhaseCompletion(
      {
        selectionMode: phase.selectionMode,
        maxSelections: phase.maxSelections,
        isRequired: phase.isRequired,
        requiresReceiptUpload: phase.requiresReceiptUpload,
      },
      phase.options.map((o) => ({
        id: o.id,
        requiresReceipt: o.requiresReceipt,
      })),
      phase.selections.map((s) => ({
        optionId: s.optionId,
        source: s.source,
        receiptFileId: s.receiptFileId,
      })),
      // Field-data completion: present and not-explicitly-incomplete.
      // We don't re-validate field-by-field here — the PUT handler
      // does, and we trust the submission exists ⇒ fields were
      // satisfied when written. For phases with no fields the
      // submission is created with an empty object on first submit;
      // for the read path "submission exists" is a sufficient proxy.
      // Phases that have no submission AND no required fields are
      // still "fields satisfied" by definition (nothing to satisfy).
      phase.submissions[0] !== undefined ||
        phase.steps.flatMap((st) => st.fields).every((f) => !f.required)
    ),
  });
}

// PUT — single combined endpoint for the attendee's Submit action.
// Accepts { data?, optionIds?, expectedSelectionsUpdatedAt? }. When both
// data and optionIds are present, BOTH writes happen inside one
// prisma.$transaction so the user gets a single atomic outcome.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { eventSlug, phaseId } = await params;

  const ctx = await loadAuthorizedContext(req, eventSlug, phaseId);
  if ("error" in ctx) return ctx.error;
  const { phase, registration, event } = ctx;

  const parsed = submitPhasePortalSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission body", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data, optionIds, expectedSelectionsUpdatedAt } = parsed.data;

  // Phase access gate. Admin overrides win; otherwise the date-based
  // window applies.
  const override = phase.accessOverrides[0]?.status ?? null;
  const status = computePhaseStatus(phase, override, new Date());
  if (status !== "OPEN") {
    return NextResponse.json(
      {
        error: `This phase is ${status.toLowerCase().replace("_", " ")}.`,
        code: "PHASE_NOT_OPEN",
      },
      { status: 403 }
    );
  }

  // Validate required fields on the field path. Same logic as before;
  // skipped when no field data is provided.
  if (data) {
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
  }

  // ── Compose selections + submission writes inside one transaction.
  // Either or both may be present in the request; the legacy field-only
  // path is preserved when optionIds is absent.
  try {
    // 20s timeout matches the standalone submitAttendeeSelections wrapper.
    // The combined route transaction does the same per-option FOR UPDATE
    // work plus a submission upsert, so it can queue under the same
    // contention; we want OPTION_FULL responses, not opaque transaction
    // timeouts, when many attendees race a capacity-1 option.
    const result = await prisma.$transaction(async (tx) => {
      let selectionsResult: Awaited<
        ReturnType<typeof submitAttendeeSelectionsInTx>
      > | null = null;

      if (optionIds !== undefined) {
        selectionsResult = await submitAttendeeSelectionsInTx(tx, {
          phaseId: phase.id,
          registrationId: registration.id,
          optionIds,
          expectedSelectionsUpdatedAt,
          eventId: event.id,
        });
      }

      let submission: Awaited<
        ReturnType<typeof tx.phaseSubmission.upsert>
      > | null = null;
      if (data) {
        submission = await tx.phaseSubmission.upsert({
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
      }

      return { selectionsResult, submission };
    }, { timeout: 20_000, maxWait: 10_000 });

    return NextResponse.json({
      success: true,
      submission: result.submission
        ? {
            id: result.submission.id,
            submittedAt: result.submission.submittedAt,
            updatedAt: result.submission.updatedAt,
          }
        : null,
      selections: result.selectionsResult
        ? result.selectionsResult.selections.map((s) => ({
            id: s.id,
            optionId: s.optionId,
            source: s.source,
            assignedAt: s.assignedAt,
            updatedAt: s.updatedAt,
            hasReceipt: !!s.receiptFileId,
            // notes: omitted — admin-only. Receipt detail is null here
            // because PUT writes selections only (no receipts can be
            // attached at submit time — they come later via the
            // upload flow). The client refetches after upload to get
            // receipt metadata.
            receipt: null,
          }))
        : null,
      selectionsUpdatedAt:
        result.selectionsResult?.selectionsUpdatedAt ?? null,
      // Refreshed counts for UI capacity badges. Only present when
      // selections were written; field-only submits don't affect counts.
      options: result.selectionsResult?.options ?? null,
    });
  } catch (e) {
    return mapServiceError(e, phase.id);
  }
}

/**
 * Map service-layer typed errors to HTTP responses. On OPTION_FULL we
 * include refreshed counts for every option on the phase so the client
 * can recover in one round-trip — no follow-up GET needed.
 */
async function mapServiceError(
  e: unknown,
  phaseId: string
): Promise<NextResponse> {
  if (e instanceof OptionFullError) {
    // Read fresh counts AFTER the failed (rolled-back) transaction so
    // the client sees the post-rollback state. This is a deliberate
    // out-of-transaction read; values may shift slightly under load,
    // but they're informative for UI recovery.
    let options;
    try {
      options = await readOptionCountSummary(prisma, phaseId);
    } catch {
      options = null;
    }
    return NextResponse.json(
      {
        error: e.message,
        code: e.code,
        optionId: e.optionId,
        options,
      },
      { status: 409 }
    );
  }
  if (e instanceof SelectionsConcurrencyError) {
    return NextResponse.json(
      {
        error: e.message,
        code: e.code,
        currentSelectionsUpdatedAt: e.currentSelectionsUpdatedAt,
      },
      { status: 409 }
    );
  }
  if (e instanceof SelectionsLockedError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: 409 }
    );
  }
  if (e instanceof SelectionsAdminLockedError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: 403 }
    );
  }
  if (e instanceof SelectionModeNotWritableError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: 400 }
    );
  }
  if (e instanceof TooManySelectionsError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: 400 }
    );
  }
  if (e instanceof OptionsCrossPhaseError) {
    return NextResponse.json(
      { error: e.message, code: e.code, optionId: e.optionId },
      { status: 400 }
    );
  }
  if (e instanceof OptionInactiveError) {
    return NextResponse.json(
      { error: e.message, code: e.code, optionId: e.optionId },
      { status: 400 }
    );
  }
  if (e instanceof SelectionDuplicateError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: 400 }
    );
  }
  if (e instanceof PhaseNotFoundForSelectionError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: 404 }
    );
  }
  // Unexpected error — log and return generic 500.
  console.error("[portal phase PUT] unexpected error:", e);
  return NextResponse.json(
    { error: "Submission failed. Please try again." },
    { status: 500 }
  );
}
