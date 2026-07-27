// Column model for the attendees table: the built-in manageable columns,
// the namespaced dynamic-column key scheme, and small display helpers.

import type { ManageableColumn } from "@/components/attendee/columns-menu";
import type { ContactStatus } from "./types";

export const statusConfig: Record<ContactStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; }> = {
  IMPORTED: { label: "Imported", variant: "secondary" },
  INVITED: { label: "Invited", variant: "outline" },
  REGISTERED: { label: "Registered", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

// User-manageable table columns (show/hide + reorder), in default order.
// The select checkbox, Name, and the row-actions column are structural and
// not part of this list — Name is always shown first. Persisted per-event in
// localStorage; see useColumnManager. The "Category" column is additionally
// suppressed when the list is already filtered to a single category
// (isSingleCategory), matching the long-standing behavior.
export const MANAGEABLE_COLUMNS: ManageableColumn[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "organization", label: "Organization" },
  { key: "designation", label: "Designation" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
  { key: "emailed", label: "Emailed" },
  { key: "invited", label: "Invited" },
  { key: "registered", label: "Registered" },
  { key: "confirmationCode", label: "Confirmation code" },
  { key: "badge", label: "Badge" },
];
export const DEFAULT_COLUMN_ORDER = MANAGEABLE_COLUMNS.map((c) => c.key);
export const MANAGEABLE_KEYS = new Set(DEFAULT_COLUMN_ORDER);
// Columns shown only when an admin opts in — kept off by default so the
// table stays compact and adding them never widens an existing layout.
export const DEFAULT_HIDDEN = new Set(["phone", "designation", "confirmationCode"]);
export const columnStorageKey = (eventId: string) => `attendees:columns:${eventId}`;

// Registration form-answer columns are dynamic (per event) and namespaced so
// their keys can't collide with the built-in column keys above. They are
// always opt-in (hidden until the admin ticks them).
export const FORM_COLUMN_PREFIX = "form:";
export const GROUP_COLUMN_PREFIX = "group:";
// Post-registration answer columns carry the full key from the server
// (`phase:<phaseId>:<fieldName>`); the client never constructs or parses it.
export const PHASE_COLUMN_PREFIX = "phase:";
export const formColumnKey = (name: string) => `${FORM_COLUMN_PREFIX}${name}`;
export const groupColumnKey = (id: string) => `${GROUP_COLUMN_PREFIX}${id}`;
export const isDynamicColumnKey = (k: string) =>
  k.startsWith(FORM_COLUMN_PREFIX) ||
  k.startsWith(GROUP_COLUMN_PREFIX) ||
  k.startsWith(PHASE_COLUMN_PREFIX);
// A persisted layout may reference a built-in key or a dynamic (form / group)
// key; dynamic keys are validated against the event's actual fields/groups
// later (at render).
export const isPersistedColumnKey = (k: unknown): k is string =>
  typeof k === "string" && (MANAGEABLE_KEYS.has(k) || isDynamicColumnKey(k));

// If a cell value is a single URL, return a hyperlinkable href (prepending
// https:// for bare www. values); otherwise null. Used to make Website /
// Social Media answers clickable in the list. Only matches when the WHOLE
// trimmed value is one URL — non-URL text (handles, Arabic, numbers) and
// comma-joined multi-values stay plain.
export function looksLikeUrl(value: string): string | null {
  const s = value.trim();
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^www\.\S+$/i.test(s)) return `https://${s}`;
  return null;
}
