import { z } from "zod";
import { PhaseSelectionMode, PhaseType } from "@prisma/client";

/**
 * v1 invariant: only POST_REGISTRATION phases may carry selectable options.
 * The REGISTRATION phase keeps its current "fields only" shape — its
 * `selectionMode` must stay `NONE`. The form-builder UI hides the Options
 * panel on REGISTRATION phases and the API enforces this on every PATCH.
 */
export function assertSelectionModeAllowed(
  phaseType: PhaseType,
  selectionMode: PhaseSelectionMode | null | undefined
): void {
  if (
    selectionMode &&
    selectionMode !== PhaseSelectionMode.NONE &&
    phaseType === PhaseType.REGISTRATION
  ) {
    throw new SelectionModeNotAllowedError();
  }
}

export class SelectionModeNotAllowedError extends Error {
  readonly code = "SELECTION_MODE_NOT_ALLOWED_ON_REGISTRATION_PHASE";
  constructor() {
    super(
      "Selectable options are only available on post-registration phases. " +
        "The REGISTRATION phase must keep selectionMode = NONE."
    );
  }
}

// ─── Stage 2 Zod schemas ───────────────────────────────────────────────

const optionalNullableString = z
  .union([z.string().min(1), z.null()])
  .optional();

export const phaseSelectionModeSchema = z.enum([
  "NONE",
  "ADMIN_ASSIGNED",
  "ATTENDEE_PICKS",
  "MIXED",
  "EXTERNAL_BOOKING",
]);

// Phase-level patch extension. Layered onto the existing PATCH
// /api/events/[eventId]/phases/[phaseId] payload. The REGISTRATION-phase
// guard is enforced in phase.service.updatePhase via assertSelectionModeAllowed.
export const updatePhaseSelectionSchema = z.object({
  selectionMode: phaseSelectionModeSchema.optional(),
  maxSelections: z.number().int().min(1).max(50).optional(),
  allowChangeAfterSubmit: z.boolean().optional(),
  requiresReceiptUpload: z.boolean().optional(),
});

// Optimistic-concurrency token sent on any PATCH that wants conflict
// detection. Clients pass the row's updatedAt as ISO; the service refuses
// the write if the row has moved on. Optional so existing callers keep
// working unchanged.
export const expectedUpdatedAtSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
});

// Option metadata is a flat string-to-string map ({ price: "180", ... }).
// Stored as JSON in PhaseOption.metadata. The UI renders it as a key-value
// editor; ordering inside the JSON object is not preserved (don't rely on it).
const optionMetadata = z
  .record(z.string().min(1).max(64), z.string().max(500))
  .nullable()
  .optional();

const optionalUrl = z
  .union([z.string().url(), z.literal(""), z.null()])
  .optional();

const optionalCapacity = z
  .union([z.number().int().min(0).max(100000), z.null()])
  .optional();

// 3-state requiresReceipt: true = always require for this option,
// false = never require, null = inherit phase.requiresReceiptUpload.
// `undefined` on PATCH means "leave unchanged."
const optionalRequiresReceipt = z
  .union([z.boolean(), z.null()])
  .optional();

export const createOptionSchema = z.object({
  label: z.string().min(1, "Label is required").max(200),
  labelAr: optionalNullableString,
  description: optionalNullableString,
  descriptionAr: optionalNullableString,
  externalUrl: optionalUrl,
  capacity: optionalCapacity,
  metadata: optionMetadata,
  requiresReceipt: optionalRequiresReceipt,
  isActive: z.boolean().optional(),
});

export const updateOptionSchema = createOptionSchema
  .partial()
  .merge(expectedUpdatedAtSchema);

export const reorderOptionSchema = z.object({
  direction: z.enum(["up", "down"]),
});

// ─── Stage 3: portal phase submit ───────────────────────────────────

/**
 * Body schema for `PUT /api/portal/[eventSlug]/phases/[phaseId]`.
 *
 * Backwards-compatible: existing field-only submits keep working without
 * sending optionIds. When optionIds is present, the route runs the
 * selections write + the field upsert inside one prisma.$transaction so
 * the user gets a single atomic outcome on Submit.
 *
 * `expectedSelectionsUpdatedAt` is the concurrency token: the latest
 * `updatedAt` across this attendee's existing selections on this phase
 * (or null on first-time submit). Server compares to live MAX(updatedAt)
 * inside a SELECT FOR UPDATE; mismatch → 409 SELECTIONS_CONCURRENCY.
 */
export const submitPhasePortalSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  optionIds: z.array(z.string().min(1)).max(50).optional(),
  expectedSelectionsUpdatedAt: z
    .union([z.string().datetime(), z.null()])
    .optional(),
});
