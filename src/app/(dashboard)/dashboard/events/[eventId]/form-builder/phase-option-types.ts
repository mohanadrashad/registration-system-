import type { PhaseSelectionMode } from "@prisma/client";

// ─── Types — kept local so page.tsx doesn't bloat. ──────────────────

export interface PhaseOption {
  id: string;
  label: string;
  labelAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  externalUrl: string | null;
  capacity: number | null;
  metadata: Record<string, string> | null;
  requiresReceipt: boolean | null;
  // Category-Phases stage 3: per-option receipt copy rendered above the
  // file picker on the portal upload screen. All four optional.
  receiptLabel: string | null;
  receiptInstructions: string | null;
  receiptLabelAr: string | null;
  receiptInstructionsAr: string | null;
  isActive: boolean;
  order: number;
  // updatedAt is the optimistic-concurrency token. Kept in ISO-string form
  // because that's how it arrives over the wire and how we send it back.
  updatedAt: string;
  _count?: { selections: number };
}

export interface PhaseOptionsPanelData {
  id: string;
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  // Phase row's updatedAt — used as the concurrency token for phase patches
  // (selectionMode toggle, maxSelections, allowChange, requireReceipt).
  updatedAt: string;
  options: PhaseOption[];
}

export const SELECTION_MODE_LABELS: Record<PhaseSelectionMode, string> = {
  NONE: "Off",
  ADMIN_ASSIGNED: "Admin assigns for everyone",
  ATTENDEE_PICKS: "Attendees pick",
  MIXED: "Mixed (admin or attendee)",
  EXTERNAL_BOOKING: "External booking (info only + receipt)",
};

export const SELECTION_MODE_DESCRIPTIONS: Record<PhaseSelectionMode, string> = {
  NONE: "",
  ADMIN_ASSIGNED:
    "Admin assigns each attendee an option. Attendees see their assignment read-only.",
  ATTENDEE_PICKS:
    "Attendees pick their own option from the list. Capacity limits apply.",
  MIXED:
    "Admin can pre-assign some attendees; the rest pick for themselves.",
  EXTERNAL_BOOKING:
    "Options are informational (e.g. hotels with booking links). Attendees book elsewhere and upload a receipt.",
};

export const MODES_WITH_MAX_SELECTIONS: PhaseSelectionMode[] = [
  "ATTENDEE_PICKS",
  "MIXED",
];
