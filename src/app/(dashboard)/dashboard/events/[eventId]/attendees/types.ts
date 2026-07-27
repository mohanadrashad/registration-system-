// Data shapes shared by the attendees list page and its extracted pieces.
// These mirror what /api/events/[eventId]/attendees returns.

export type ContactStatus = "IMPORTED" | "INVITED" | "REGISTERED" | "CANCELLED";

export interface Contact {
  id: string;
  // Per-event sequential attendee number (null only for legacy rows not yet
  // backfilled). Shown as the leftmost "ID" column.
  serialNumber: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  designation: string | null;
  category: string | null;
  status: ContactStatus;
  registration: { status: string; registeredAt: string; confirmationCode: string; badgeEmailSent: boolean } | null;
  emailLogs: { id: string; status: string; sentAt: string | null }[];
  // Pre-formatted registration form answers, keyed by FormField.name. Only
  // non-empty answers are present; the server formats them to match export.
  formValues?: Record<string, string>;
  // FILE-field answers: FormField.name → fileId. Lets the table link the
  // filename (from formValues) straight to the admin-auth file stream route.
  fileValues?: Record<string, string>;
  // Attendee Group value label(s), keyed by group id (joined per group).
  groupValues?: Record<string, string>;
  // Post-registration phase answers, keyed by the full `phase:<id>:<name>`
  // column key the server emits (read directly, no parsing).
  phaseValues?: Record<string, string>;
}

export interface StatusCounts {
  IMPORTED: number;
  INVITED: number;
  REGISTERED: number;
  CANCELLED: number;
}

export interface Event {
  id: string;
  name: string;
  slug: string;
  categories: string[];
}

export interface EmailTemplate {
  id: string;
  name: string;
  type: string;
  subject: string;
}

export interface PostRegPhase {
  id: string;
  title: string;
  options?: { id: string; label: string }[];
}

// Single active sort across the table. The server takes one `sort`
// param, so the Registered and Emailed column headers are mutually
// exclusive sorters. "registered_desc" is the default (newest first)
// and maps to no `sort` param — see the API route's orderBy.
export type AttendeesSort =
  | "registered_desc"
  | "registered_asc"
  | "emailed_yes"
  | "emailed_no";

// Attendee groups, lazy-fetched for the bulk-assign dialog.
export interface BulkGroup {
  id: string;
  name: string;
  allowMultiple: boolean;
  values: { id: string; label: string }[];
}
