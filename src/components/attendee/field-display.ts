import { COUNTRIES } from "@/lib/form-builder/countries";
import {
  parseFormFieldOptions,
  OTHER_VALUE,
  OTHER_SUFFIX,
  resolveOtherLabel,
} from "@/lib/form-builder/options-parse";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";

export { isSyntheticEmail };

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
  // Stage 3 of ADMIN_EDIT_FIX_SPEC: used by the attendee detail page's
  // required-field warning banner to flag missing required answers
  // post-registration (e.g. after an admin Remove on a required FILE).
  // Informational only — no enforcement on check-in / badge / email.
  required: boolean;
}

export interface UserRef {
  id: string;
  name: string | null;
  email: string;
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
  // Stage 4 of ADMIN_EDIT_FIX_SPEC: audit-trail display. updatedBy is
  // the FK; updater is the joined User (null on legacy pre-Stage-1
  // rows AND on visitor-driven writes — the portal self-edit path
  // intentionally leaves it null because visitors aren't Users).
  updatedBy: string | null;
  updater: UserRef | null;
  registration: {
    id: string;
    status: string;
    registeredAt: string;
    confirmationCode: string;
    badgeEmailSent: boolean;
    badgeGenerated: boolean;
    // Stage 4 audit-trail surfaces on Registration:
    updatedBy: string | null;
    updater: UserRef | null;
    approvedBy: string | null;
    approvedAt: string | null;
    approver: UserRef | null;
    rejectedBy: string | null;
    rejectedAt: string | null;
    rejecter: UserRef | null;
    rejectionReason: string | null;
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
  // FILE field stub (Stage 2). formData[fieldName] for type=FILE is
  // { fileId, filename, mimeType, sizeBytes }. Stage 3 upgrades this
  // to "📄 filename.pdf (482 KB · PDF)" + View button; until then we
  // at least render the filename so admin/portal/CSV/email surfaces
  // don't show "[object Object]".
  if (
    field.type === "FILE" &&
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { filename?: unknown }).filename === "string"
  ) {
    return (raw as { filename: string }).filename;
  }
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

// Name string for table rows / scan banners that have only the contact
// columns + confirmation code to work with. Returns the full name when
// either part is present; otherwise the short confirmation-code stub.
// Use this for surfaces that don't render free-form FormField answers
// (the richer `deriveDisplayName` below covers those).
export function fallbackName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  confirmationCode: string | null | undefined
): string {
  const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (full) return full;
  if (confirmationCode) return `Reg #${confirmationCode.slice(0, 8)}`;
  return "Attendee";
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
