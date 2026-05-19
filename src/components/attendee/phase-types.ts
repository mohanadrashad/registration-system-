import type { PhaseSelectionMode } from "@prisma/client";

// ─── Wire formats (1:1 with the existing endpoints) ──────────────────

// GET /contacts/[contactId]/phase-access
export type PhaseStatus = "LOCKED" | "NOT_OPEN" | "OPEN" | "CLOSED";
export type AccessOverride = "OPEN" | "LOCKED" | null;

export interface PhaseAccessItem {
  id: string;
  title: string;
  titleAr: string | null;
  opensAt: string | null;
  closesAt: string | null;
  isRequired: boolean;
  override: AccessOverride;
  reason: string | null;
  overriddenAt: string | null;
  overriddenBy: string | null;
  status: PhaseStatus;
}

// GET /contacts/[contactId]/phase-submissions
export interface PhaseSubmissionField {
  name: string;
  label: string;
  labelAr: string | null;
  type: string;
  options: { value: string; label: string; labelAr?: string }[] | null;
}

export interface PhaseSubmissionStep {
  id: string;
  title: string;
  fields: PhaseSubmissionField[];
}

export interface PhaseSubmissionItem {
  id: string;
  title: string;
  titleAr: string | null;
  status: "SUBMITTED" | "NOT_SUBMITTED";
  submittedAt: string | null;
  updatedAt: string | null;
  steps: PhaseSubmissionStep[];
  data: Record<string, unknown> | null;
}

// GET /contacts/[contactId]/selections
export interface PhaseOption {
  id: string;
  label: string;
  labelAr: string | null;
  capacity: number | null;
  taken: number;
  full: boolean;
  isActive: boolean;
  requiresReceipt: boolean | null;
}

export interface ExistingSelection {
  id: string;
  optionId: string;
  optionLabel: string;
  optionLabelAr: string | null;
  source: "ADMIN_ASSIGNED" | "ATTENDEE_PICKED";
  assignedAt: string;
  assignedBy: string | null;
  assignedByUser: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  notes: string | null;
  hasReceipt: boolean;
  receipt: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
  } | null;
}

export interface SelectionPhaseEntry {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  isRequired: boolean;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  options: PhaseOption[];
  selections: ExistingSelection[];
}

// ─── Merged per-phase view model ─────────────────────────────────────

export interface MergedPhase {
  id: string;
  title: string;
  access: PhaseAccessItem;
  submission: PhaseSubmissionItem | undefined;
  selection: SelectionPhaseEntry | undefined;
}

export type CompletionLabel =
  | "Complete"
  | "Partial"
  | "Receipt missing"
  | "Not started"
  | "Pending assignment"
  | "Closed";

/**
 * Compose the header completion badge from the merged data. There is no
 * single pre-existing function that yields these labels (today each of
 * the three cards shows its own status); this folds the same underlying
 * signals into one badge. Presentation only — no new data.
 */
export function computeCompletion(p: MergedPhase): {
  label: CompletionLabel;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (p.access.status === "CLOSED") {
    return { label: "Closed", variant: "outline" };
  }

  const sel = p.selection;
  const hasSelectionSlot = !!sel && sel.selectionMode !== "NONE";
  const picked = sel ? sel.selections.length > 0 : false;

  // Admin-assigned, option-bearing, nothing assigned yet.
  if (hasSelectionSlot && sel!.selectionMode === "ADMIN_ASSIGNED" && !picked) {
    return { label: "Pending assignment", variant: "secondary" };
  }

  // Receipt requirement: a chosen option needs a receipt (or the phase
  // forces one) but none is attached.
  if (hasSelectionSlot && picked) {
    const needsReceipt =
      sel!.requiresReceiptUpload ||
      sel!.selections.some((s) => {
        const opt = sel!.options.find((o) => o.id === s.optionId);
        return opt?.requiresReceipt === true;
      });
    const missingReceipt =
      needsReceipt && sel!.selections.every((s) => !s.hasReceipt);
    if (missingReceipt) {
      return { label: "Receipt missing", variant: "destructive" };
    }
  }

  const hasFormFields = !!p.submission?.steps.some((s) => s.fields.length > 0);
  const submitted = p.submission?.status === "SUBMITTED";

  const submissionDone = !hasFormFields || submitted;
  const selectionDone = !hasSelectionSlot || picked;
  const anyProgress = submitted || picked;

  if (submissionDone && selectionDone && anyProgress) {
    return { label: "Complete", variant: "default" };
  }
  if (!anyProgress) {
    return { label: "Not started", variant: "outline" };
  }
  return { label: "Partial", variant: "secondary" };
}
