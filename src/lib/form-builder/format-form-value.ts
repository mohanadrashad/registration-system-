import { FieldType } from "@prisma/client";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  OTHER_VALUE,
} from "@/lib/form-builder/options-parse";
import { COUNTRIES } from "@/lib/form-builder/countries";

// FormField types that carry no usable value in a flat cell (layout-only).
export const FORM_COLUMN_SKIP_TYPES = new Set<string>([
  "HEADING",
  "DIVIDER",
  "PARAGRAPH",
  "HIDDEN",
]);

// FormField names that are already surfaced as their own Contact columns —
// excluded from the dynamic form-answer set so they aren't duplicated.
export const CONTACT_COLUMN_NAMES = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
  "category",
]);

// True for form fields that should be offered as an answer column / export
// column (not a layout element, not a field already shown as a contact
// column).
export function isDynamicFormField(f: { type: string; name: string }): boolean {
  return !FORM_COLUMN_SKIP_TYPES.has(f.type) && !CONTACT_COLUMN_NAMES.has(f.name);
}

/**
 * Render a single registration form answer as a display string, matching the
 * dashboard and the CSV/Excel export (option values → labels, country codes →
 * names, booleans → Yes/No, multi-select arrays joined, FILE → filename).
 * Used by both the attendees list route and the registrations export route so
 * "what you see is what you export" holds by construction.
 */
export function formatFormFieldValue(
  field: { type: FieldType; options: unknown },
  value: unknown
): string {
  if (value === undefined || value === null || value === "") return "";
  const parsed = parseFormFieldOptions(field.options);
  const otherLabel = parsed.other ? resolveOtherLabel(parsed.other, "en") : "Other";
  const renderOther = () => otherLabel;

  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v === OTHER_VALUE) return renderOther();
        const opt = parsed.options.find((o) => o.value === v);
        return opt?.label ?? String(v);
      })
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // FILE field: emit the original filename rather than "[object Object]".
  if (
    field.type === FieldType.FILE &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { filename?: unknown }).filename === "string"
  ) {
    return (value as { filename: string }).filename;
  }
  // COUNTRY stores an ISO 2-letter code; resolve to the full name.
  if (field.type === FieldType.COUNTRY) {
    const country = COUNTRIES.find((c) => c.code === value);
    return country ? country.name : String(value);
  }
  if (value === OTHER_VALUE) return renderOther();
  if (parsed.options.length > 0) {
    const opt = parsed.options.find((o) => o.value === value);
    if (opt) return opt.label;
  }
  return String(value);
}
