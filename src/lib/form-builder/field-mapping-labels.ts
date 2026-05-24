import { FieldMapping, FieldType } from "@prisma/client";

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

/**
 * Which FieldTypes are valid carriers for each mapping role. Source of
 * truth for both the dropdown filter (Chunk 3) and the API validation
 * (Chunk 2). Keep these in sync — server-side rejection of an
 * incompatible role must mirror what the dropdown showed the admin.
 */
export const COMPATIBLE_FIELD_TYPES: Record<FieldMapping, ReadonlySet<FieldType>> = {
  FIRST_NAME: new Set(["TEXT"]),
  LAST_NAME: new Set(["TEXT"]),
  FULL_NAME: new Set(["TEXT"]),
  EMAIL: new Set(["TEXT", "EMAIL"]),
  PHONE: new Set(["TEXT", "PHONE", "PHONE_COUNTRY"]),
  ORGANIZATION: new Set(["TEXT", "SELECT", "RADIO"]),
  DESIGNATION: new Set(["TEXT", "SELECT", "RADIO"]),
};

/**
 * Roles that may be carried by multiple fields per event. LAST_NAME is
 * the only multi-value role — values from all tagged fields are joined
 * in FormField.order order at registration time. Every other role is
 * single-value; assigning it to a second field requires a Swap.
 */
export const MULTI_VALUE_ROLES: ReadonlySet<FieldMapping> = new Set(["LAST_NAME"]);

/**
 * Roles that participate in FULL_NAME mutual exclusion: tagging any
 * field FULL_NAME forbids tagging any field FIRST_NAME or LAST_NAME,
 * and vice versa. Single source of truth for the validator.
 */
export const FULL_NAME_EXCLUSIVE_ROLES: ReadonlySet<FieldMapping> = new Set([
  "FIRST_NAME",
  "LAST_NAME",
]);
