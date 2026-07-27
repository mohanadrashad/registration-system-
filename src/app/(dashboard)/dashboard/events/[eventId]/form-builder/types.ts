// Data shapes shared by the form-builder page and its extracted pieces.
// These mirror what /api/events/[eventId]/phases returns (after the
// options-normalization pass in fetchEverything).

import type {
  FieldType,
  FieldWidth,
  FieldMapping,
  PhaseType,
  OptionColumns,
  PhaseSelectionMode,
} from "@prisma/client";
import type { PhaseOption } from "./phase-options-panel";
import type { OtherConfig } from "@/lib/form-builder/options-parse";
import type { FileFieldMetadata } from "@/lib/validations/file-field-metadata";

export interface FieldOption {
  value: string;
  label: string;
  labelAr?: string;
}

export interface ConditionalRule {
  showIf: {
    field: string;
    operator: "equals" | "notEquals" | "contains";
    value: string | boolean;
  };
}

export interface FormField {
  id: string;
  name: string;
  label: string;
  labelAr?: string;
  type: FieldType;
  placeholder?: string;
  placeholderAr?: string;
  helpText?: string;
  helpTextAr?: string;
  required: boolean;
  order: number;
  width: FieldWidth;
  optionColumns: OptionColumns;
  isSystem: boolean;
  isActive: boolean;
  // `options` is the option array for SELECT/RADIO/MULTISELECT only. The
  // server may persist a wrapped shape with extra config; we always
  // normalize to the array on load and keep `other` + `maxSelections` as
  // siblings on this interface for editor state.
  options?: FieldOption[];
  other?: OtherConfig;
  maxSelections?: number;
  showSelectionCounter?: boolean;
  stepId: string;
  conditional?: ConditionalRule | null;
  // FormField.metadata is a free-form Json column shared across types.
  // For FILE fields it carries `{ maxSizeMB, allowedMimeTypes }`; other
  // field types ignore it. Always normalize through parseFileFieldMetadata
  // before passing into the FILE settings editor.
  metadata?: unknown;
  // Contact column mapping (Stage 1 of FIELD_MAPPING_SPEC). Null = no
  // mapping; the register endpoint falls back to legacy literal-key
  // destructure for unmapped roles.
  mapsTo?: FieldMapping | null;
}

export interface Step {
  id: string;
  title: string;
  order: number;
  fields: FormField[];
}

export interface Phase {
  id: string;
  type: PhaseType;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  order: number;
  steps: Step[];
  opensAt?: string | null;
  closesAt?: string | null;
  isRequired: boolean;
  reminderTemplateId?: string | null;
  // Stage 2 selection fields. Always present on the wire — defaults to
  // NONE/1/false/false on phases that don't use the Options panel.
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  // Stage 2 (category phases): empty = visible to everyone; non-empty
  // = only attendees whose category is in this list.
  appliesToCategories: string[];
  // Concurrency token for the phase row. Used by the Options panel as
  // expectedUpdatedAt on its phase-level PATCH calls.
  updatedAt: string;
  options: PhaseOption[];
}

export interface ModulesPayload {
  postRegPhases?: boolean;
  multiLanguage?: boolean;
  selfServicePortal?: boolean;
}

export interface EmailTemplateOption {
  id: string;
  name: string;
}

// Draft state for the Add Field dialog (the page owns it — the header's
// "Add section heading" button also writes to it).
export interface NewFieldDraft {
  name: string;
  label: string;
  labelAr: string;
  placeholder: string;
  placeholderAr: string;
  helpText: string;
  helpTextAr: string;
  type: FieldType;
  required: boolean;
  width: FieldWidth;
  optionColumns: OptionColumns;
  options: FieldOption[];
  other: OtherConfig | undefined;
  maxSelections: number | undefined;
  showSelectionCounter: boolean | undefined;
  conditional: ConditionalRule | null;
  // Only consumed when type === "FILE". Kept on every newField for
  // simplicity; ignored by other field types on the wire.
  fileMetadata: FileFieldMetadata;
  // Only consumed when type === "HEADING": the section-label color
  // ("" = default muted gray). Stored into FormField.metadata.color.
  headingColor: string;
}
