// Data shapes for the CLASSIC registration template — mirror what
// /api/register/[eventSlug] returns.

export interface FormField {
  id: string;
  name: string;
  label: string;
  labelAr?: string;
  type: string;
  placeholder?: string;
  placeholderAr?: string;
  helpText?: string;
  helpTextAr?: string;
  required: boolean;
  validation?: Record<string, unknown>;
  options?: { value: string; label: string; labelAr?: string }[];
  order: number;
  width: string;
  optionColumns?: "AUTO" | "ONE" | "TWO";
  section?: string;
  conditional?: Record<string, unknown>;
  isSystem: boolean;
  defaultValue?: string;
  // FILE fields carry { maxSizeMB, allowedMimeTypes } here. Other types
  // may leave it null/undefined. Always read via parseFileFieldMetadata.
  metadata?: unknown;
}

export interface FormStep {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  order: number;
  fields: FormField[];
}

export interface Branding {
  primaryColor: string;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  logoWhiteUrl?: string | null;
  headerImageUrl?: string | null;
  headerColor?: string | null;
  headerShowLogo?: boolean | null;
  logoHeight?: number | null;
  welcomeTitle?: string | null;
  welcomeTitleAr?: string | null;
  welcomeMessage?: string | null;
  welcomeMessageAr?: string | null;
  footerText?: string | null;
  footerTextAr?: string | null;
  customCss?: string | null;
}

export interface EventData {
  eventName: string;
  eventDescription?: string | null;
  venue?: string | null;
  startDate: string;
  endDate: string;
  branding?: Branding | null;
  steps: FormStep[];
  contact?: Record<string, string | null>;
}

// FILE fields store the denormalized upload ref directly under the
// field name; non-FILE types continue to use the original primitive
// shapes. The submission handler reads either shape per field type.
export type UploadedFileRef = {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};
export type FormFieldValue = string | boolean | string[] | UploadedFileRef | null;
export type FormValueMap = Record<string, FormFieldValue>;

export interface DraftPayload {
  currentStep: number;
  formValues: FormValueMap;
  savedAt: string;
}

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
