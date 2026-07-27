// Data shapes shared by the phase fill page and its extracted pieces.
// These mirror what /api/portal/[eventSlug]/phases/[phaseId] returns.

import type { PhaseSelectionMode } from "@prisma/client";
import type { PortalPhaseOption } from "./phase-options-card";

export interface FormField {
  id: string;
  name: string;
  label: string;
  labelAr?: string;
  type: string;
  placeholder?: string;
  placeholderAr?: string;
  helpText?: string;
  helpTextAr?: string;
  required: boolean;
  validation?: Record<string, unknown>;
  options?: { value: string; label: string; labelAr?: string }[];
  order: number;
  width: string;
  // HEADING fields carry { color } here for the section-label color.
  metadata?: unknown;
  conditional?: Record<string, unknown>;
  isSystem: boolean;
  defaultValue?: string;
}

export interface FormStep {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  order: number;
  fields: FormField[];
}

export type PhaseStatus = "LOCKED" | "NOT_OPEN" | "OPEN" | "CLOSED";

export interface Branding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  customCss?: string | null;
}

export interface EventLite {
  name: string;
  slug: string;
  branding?: Branding | null;
  multiLanguage?: boolean;
}

export type PhaseCompletionStatus =
  | "NOT_STARTED"
  | "PARTIALLY_COMPLETE"
  | "COMPLETE"
  | "PENDING_ASSIGNMENT";

export interface PhaseData {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  isRequired: boolean;
  status: PhaseStatus;
  steps: FormStep[];
  // Stage 3: selection-related fields. Always present on the wire even
  // when the phase has no options panel — defaults to NONE/1/false/false
  // server-side, so legacy phases keep working unchanged.
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  options: PortalPhaseOption[];
}

export interface SubmissionData {
  data: Record<string, unknown>;
  submittedAt: string;
  updatedAt: string;
}

export type FormValueMap = Record<string, string | boolean | string[]>;
