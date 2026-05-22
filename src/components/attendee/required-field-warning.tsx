"use client";

import { AlertCircle } from "lucide-react";
import {
  type ContactDetail,
  type FormFieldDef,
  LAYOUT_TYPES,
  getFieldValue,
} from "./field-display";
import { isFileRef } from "./file-viewer-inline";

/**
 * Top-of-page warning banner (Mockup 4) for any required FormField
 * whose current value is missing. Triggered by admin Remove on a
 * required FILE (Stage 3's main use case) but covers ANY required
 * field that ends up empty post-registration — historical drift,
 * direct DB edits, future remove flows for other field types.
 *
 * Informational only. No code path in check-in / badge / email
 * rejects on missing required fields post-registration; the spec's
 * "warning surfaces but downstream continues to work" invariant.
 *
 * Persistent + non-dismissable: the state is data-driven. Dismissing
 * wouldn't change the underlying state — admin would just re-see it
 * on next page load. The banner self-clears once the missing field
 * has a value (re-uploaded, re-typed, etc.) on the next render.
 *
 * Renders null when no required fields are missing — caller can
 * mount unconditionally without checking.
 */
export function RequiredFieldWarning({
  contact,
  fields,
}: {
  contact: ContactDetail;
  fields: FormFieldDef[];
}) {
  const missing = fields.filter((field) => {
    if (!field.required) return false;
    if (LAYOUT_TYPES.has(field.type)) return false;
    const value = getFieldValue(contact, field);
    // FILE-specific: a malformed object or null counts as missing.
    // For everything else, the standard empty check covers
    // null/undefined/empty-string.
    if (field.type === "FILE") {
      return !isFileRef(value);
    }
    if (value === undefined || value === null) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });

  if (missing.length === 0) return null;

  const isMany = missing.length > 1;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div className="flex-1 space-y-1">
        <p className="font-medium">
          This registration is missing required data:
        </p>
        <ul className="ml-4 list-disc space-y-0.5">
          {missing.map((field) => (
            <li key={field.name}>{field.label}</li>
          ))}
        </ul>
        <p className="text-xs opacity-80">
          {isMany
            ? "These answers need to be completed."
            : "This answer needs to be completed."}
        </p>
      </div>
    </div>
  );
}
