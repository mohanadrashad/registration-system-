import { FieldMapping } from "@prisma/client";

/**
 * Display names for the FieldMapping enum. Used by the form-builder
 * dropdown options, the summary card row labels, and the per-row chip.
 * Same single-source-of-truth pattern as MODULE_INFO in module-guard.ts.
 */
export const FIELD_MAPPING_LABELS: Record<FieldMapping, string> = {
  FIRST_NAME: "First Name",
  LAST_NAME: "Last Name",
  FULL_NAME: "Full Name",
  EMAIL: "Email",
  PHONE: "Phone",
  ORGANIZATION: "Organization",
  DESIGNATION: "Designation",
};

/**
 * Legacy `formData` keys the register endpoint falls back to when no
 * field is tagged for a role. FULL_NAME has no legacy key — the legacy
 * splitter reads `body.fullName` directly as a final-rung fallback in
 * the resolver, not as a per-role lookup.
 */
export const FIELD_MAPPING_LEGACY_KEYS: Record<
  Exclude<FieldMapping, "FULL_NAME">,
  string
> = {
  FIRST_NAME: "firstName",
  LAST_NAME: "lastName",
  EMAIL: "email",
  PHONE: "phone",
  ORGANIZATION: "organization",
  DESIGNATION: "designation",
};
