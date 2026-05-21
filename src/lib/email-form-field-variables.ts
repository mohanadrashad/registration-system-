/**
 * buildFormFieldVariables
 *
 * Expose a Registration's formData answers as email-template variables
 * keyed by the FormField.name. For Other-enabled fields where the
 * visitor picked __other, the variable resolves to `Other: <custom
 * text>` (or `Other` alone if the sibling is empty). MULTISELECT
 * arrays join with ", ".
 *
 * Contact columns win on name collisions. Many events have a FormField
 * named `firstName`/`email` whose value already lands on the Contact
 * row; the existing email send orchestration populates those keys
 * directly. We do NOT want a formData-side override silently changing
 * what `{{firstName}}` resolves to in production templates. The
 * `reservedKeys` set lists every Contact column we expose by hardcode
 * — adding a formData entry for one of those names is a no-op.
 */

import type { FormField } from "@prisma/client";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";

// Keys populated by the send-email orchestration from Contact / event
// metadata. formData entries with these names are skipped to preserve
// the existing template behavior.
const RESERVED_KEYS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
  "category",
  "eventName",
  "eventDate",
  "eventVenue",
  "registrationLink",
  "confirmationCode",
  "badgeUrl",
]);

export function buildFormFieldVariables(
  fields: Pick<FormField, "name" | "type" | "options">[],
  formData: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!formData) return {};
  const out: Record<string, string> = {};

  for (const field of fields) {
    if (RESERVED_KEYS.has(field.name)) continue;
    const value = formData[field.name];
    if (value === undefined || value === null || value === "") continue;

    const parsed = parseFormFieldOptions(field.options);
    const otherLabel = parsed.other ? resolveOtherLabel(parsed.other, "en") : "Other";
    const sibling = formData[`${field.name}${OTHER_SUFFIX}`];
    const otherText = typeof sibling === "string" ? sibling.trim() : "";
    const renderOther = () =>
      otherText ? `${otherLabel}: ${otherText}` : otherLabel;

    if (Array.isArray(value)) {
      const parts = value
        .map((v) => {
          if (v === OTHER_VALUE) return renderOther();
          const opt = parsed.options.find((o) => o.value === v);
          return opt?.label ?? String(v);
        })
        .filter(Boolean);
      out[field.name] = parts.join(", ");
      continue;
    }

    if (typeof value === "boolean") {
      out[field.name] = value ? "Yes" : "No";
      continue;
    }

    if (value === OTHER_VALUE) {
      out[field.name] = renderOther();
      continue;
    }

    if (parsed.options.length > 0) {
      const opt = parsed.options.find((o) => o.value === value);
      if (opt) {
        out[field.name] = opt.label;
        continue;
      }
    }

    out[field.name] = String(value);
  }

  return out;
}
