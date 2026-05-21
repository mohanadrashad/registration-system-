import { COUNTRIES } from "@/lib/form-builder/countries";
import {
  parseFormFieldOptions,
  OTHER_VALUE,
  OTHER_SUFFIX,
  resolveOtherLabel,
} from "@/lib/form-builder/options-parse";

// ─── Shared types ────────────────────────────────────────────────────

export type ContactStatus = "IMPORTED" | "INVITED" | "REGISTERED" | "CANCELLED";

export interface FormFieldDef {
  name: string;
  label: string;
  labelAr: string | null;
  type: string;
  // Stored as JSON; may be the legacy `FieldOption[]` shape or the
  // wrapped `{ options, other?, maxSelections? }` shape. Always normalize
  // through parseFormFieldOptions before iterating.
  options: unknown;
  isSystem: boolean;
}

export interface ContactDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  designation: string | null;
  category: string | null;
  status: ContactStatus;
  inviteToken: string | null;
  metadata: Record<string, unknown> | null;
  importBatch: string | null;
  createdAt: string;
  updatedAt: string;
  registration: {
    id: string;
    status: string;
    registeredAt: string;
    confirmationCode: string;
    badgeEmailSent: boolean;
    badgeGenerated: boolean;
  } | null;
  emailLogs: { id: string; status: string; sentAt: string | null; subject: string }[];
  event: { slug: string; name: string; categories: string[] };
  formFields: FormFieldDef[];
}

// Field names that the register handler destructures onto Contact
// columns rather than into the free-form `metadata` blob.
export const COLUMN_FIELDS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
]);

// Structural field types that carry no answer value.
export const LAYOUT_TYPES = new Set(["HEADING", "DIVIDER", "PARAGRAPH", "HIDDEN"]);

// ─── Value resolution + formatting ───────────────────────────────────

export function getFieldValue(contact: ContactDetail, field: FormFieldDef): unknown {
  if (COLUMN_FIELDS.has(field.name)) {
    return (contact as unknown as Record<string, unknown>)[field.name];
  }
  return contact.metadata?.[field.name];
}

export function formatFieldValue(
  field: FormFieldDef,
  raw: unknown,
  allData?: Record<string, unknown> | null
): string {
  if (raw === undefined || raw === null || raw === "") return "-";

  const parsed = parseFormFieldOptions(field.options);
  const otherLabel = parsed.other ? resolveOtherLabel(parsed.other, "en") : "Other";
  const otherText = (() => {
    if (!allData) return "";
    const v = allData[`${field.name}${OTHER_SUFFIX}`];
    return typeof v === "string" ? v.trim() : "";
  })();
  const renderOther = () =>
    otherText ? `${otherLabel}: ${otherText}` : otherLabel;

  if (Array.isArray(raw)) {
    return raw
      .map((v) => {
        if (v === OTHER_VALUE) return renderOther();
        const opt = parsed.options.find((o) => o.value === v);
        return opt?.label ?? String(v);
      })
      .join(", ");
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (field.type === "COUNTRY") {
    const country = COUNTRIES.find((c) => c.code === raw);
    if (country) return country.name;
  }
  if (raw === OTHER_VALUE) return renderOther();
  if (parsed.options.length > 0) {
    const opt = parsed.options.find((o) => o.value === raw);
    if (opt) return opt.label;
  }
  return String(raw);
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@noemail.local");
}

export function deriveDisplayName(
  contact: ContactDetail,
  visibleFields: FormFieldDef[]
): { primary: string; secondary: string } {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const secondary = contact.email && !isSyntheticEmail(contact.email) ? contact.email : "";

  if (fullName) {
    return { primary: fullName, secondary };
  }

  const textFields = visibleFields.filter((f) => ["TEXT", "EMAIL", "PHONE"].includes(f.type));
  const values: string[] = [];
  for (const f of textFields) {
    const v = getFieldValue(contact, f);
    if (typeof v === "string" && v.trim() !== "") {
      values.push(v.trim());
      if (values.length === 2) break;
    }
  }
  if (values.length > 0) {
    return { primary: values.join(" "), secondary };
  }
  return {
    primary: "Attendee",
    secondary: contact.registration?.confirmationCode || "",
  };
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Source is not an explicit column. It is derived from the strongest
// available signal: an import batch tag (bulk import) > a personal
// invite token (admin added / invited) > otherwise the attendee
// registered themselves.
export function deriveSource(contact: ContactDetail): string {
  if (contact.importBatch) return "Bulk import";
  if (contact.inviteToken) return "Manual / invited";
  return "Self-registered";
}

export const STATUS_CONFIG: Record<
  ContactStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  IMPORTED: { label: "Imported", variant: "secondary" },
  INVITED: { label: "Invited", variant: "outline" },
  REGISTERED: { label: "Registered", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};
