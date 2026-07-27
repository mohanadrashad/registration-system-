// Data shapes shared by the portal home page and its extracted pieces.
// These mirror what /api/portal/[eventSlug] and /info return.

export const COLUMN_FIELDS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
]);

export const LAYOUT_TYPES = new Set(["HEADING", "DIVIDER", "PARAGRAPH", "HIDDEN"]);

export interface FormFieldDef {
  name: string;
  label: string;
  labelAr: string | null;
  type: string;
  options: { value: string; label: string; labelAr?: string | null }[] | null;
  required: boolean;
  isSystem: boolean;
}

export interface Branding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  customCss?: string | null;
}

export interface EventInfo {
  name: string;
  description?: string;
  venue?: string;
  startDate: string;
  endDate: string;
  formFields: FormFieldDef[];
  branding?: Branding | null;
  multiLanguage?: boolean;
}

export interface RegistrationInfo {
  id: string;
  status: string;
  confirmationCode: string;
  registeredAt?: string;
  badgeGenerated: boolean;
  badgeUrl?: string;
}

export type PhaseStatus = "LOCKED" | "NOT_OPEN" | "OPEN" | "CLOSED";

export interface PhaseInfo {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  order: number;
  opensAt?: string | null;
  closesAt?: string | null;
  isRequired: boolean;
  status: PhaseStatus;
  isCompleted: boolean;
  submittedAt?: string | null;
  updatedAt?: string | null;
}

export interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  organization?: string | null;
  designation?: string | null;
  metadata?: Record<string, unknown> | null;
}

// What /api/portal/[eventSlug]/info returns — enough to brand the login
// screen before the attendee has signed in.
export interface PortalEventInfo {
  name: string;
  multiLanguage?: boolean;
  branding?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    backgroundColor?: string | null;
    textColor?: string | null;
    logoUrl?: string | null;
    welcomeTitle?: string | null;
    welcomeTitleAr?: string | null;
    welcomeMessage?: string | null;
    welcomeMessageAr?: string | null;
    customCss?: string | null;
  } | null;
}

export function getFieldValue(contact: ContactInfo, field: FormFieldDef): unknown {
  if (COLUMN_FIELDS.has(field.name)) {
    return (contact as unknown as Record<string, unknown>)[field.name];
  }
  return contact.metadata?.[field.name];
}
