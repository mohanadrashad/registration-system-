/**
 * FormField.options parser/serializer.
 *
 * Two shapes are supported on disk because the "Other" + max-selections
 * feature added optional config (`other`, `maxSelections`) alongside the
 * existing options array. Old rows keep the legacy array shape; rows that
 * use either new feature get the wrapped object shape. Both round-trip
 * through these helpers so every read/write site stays shape-agnostic.
 *
 * Legacy:  FieldOption[]
 * Wrapped: { options: FieldOption[], other?, maxSelections?, showSelectionCounter? }
 */

export interface FieldOption {
  value: string;
  label: string;
  labelAr?: string | null;
}

export interface OtherConfig {
  enabled: true;
  label?: string;
  labelAr?: string;
  placeholder?: string;
  placeholderAr?: string;
}

export interface ParsedFormFieldOptions {
  options: FieldOption[];
  other?: OtherConfig;
  maxSelections?: number;
  showSelectionCounter?: boolean;
}

/** Reserved value for the synthetic "Other" choice. Never a real option value. */
export const OTHER_VALUE = "__other";

/** Suffix for the sibling key holding the visitor's custom text. */
export const OTHER_SUFFIX = "_other";

/** Default copy when admin enables Other without customizing the labels. */
export const OTHER_DEFAULTS = {
  label: "Other (please specify)",
  labelAr: "أخرى (يرجى التحديد)",
  placeholder: "Please specify",
  placeholderAr: "يرجى التحديد",
} as const;

function isFieldOption(v: unknown): v is FieldOption {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.value === "string" && typeof o.label === "string";
}

function coerceArray(raw: unknown): FieldOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isFieldOption).map((o) => ({
    value: o.value,
    label: o.label,
    labelAr: typeof o.labelAr === "string" ? o.labelAr : o.labelAr ?? null,
  }));
}

function coerceOther(raw: unknown): OtherConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.enabled !== true) return undefined;
  const cfg: OtherConfig = { enabled: true };
  if (typeof o.label === "string" && o.label.trim()) cfg.label = o.label;
  if (typeof o.labelAr === "string" && o.labelAr.trim()) cfg.labelAr = o.labelAr;
  if (typeof o.placeholder === "string" && o.placeholder.trim()) cfg.placeholder = o.placeholder;
  if (typeof o.placeholderAr === "string" && o.placeholderAr.trim()) cfg.placeholderAr = o.placeholderAr;
  return cfg;
}

function coerceMaxSelections(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.floor(raw);
}

/**
 * Accepts:
 *   - null / undefined         → { options: [] }
 *   - JSON string              → parsed and re-handled
 *   - FieldOption[]            → legacy shape, no other/max
 *   - { options, other?, ... } → wrapped shape
 *   - anything else            → { options: [] } (best-effort, never throws)
 *
 * Strips invalid option entries so the consumer never sees garbage.
 */
export function parseFormFieldOptions(raw: unknown): ParsedFormFieldOptions {
  if (raw == null) return { options: [] };

  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { options: [] };
    }
  }

  if (Array.isArray(value)) {
    return { options: coerceArray(value) };
  }

  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    const out: ParsedFormFieldOptions = { options: coerceArray(v.options) };
    const other = coerceOther(v.other);
    if (other) out.other = other;
    const max = coerceMaxSelections(v.maxSelections);
    if (max !== undefined) out.maxSelections = max;
    if (v.showSelectionCounter === false) {
      out.showSelectionCounter = false;
    } else if (max !== undefined) {
      out.showSelectionCounter = true;
    }
    return out;
  }

  return { options: [] };
}

/**
 * Writes the legacy array shape when no new features are enabled (keeps
 * the DB tidy for the common case). Writes the wrapped shape only when
 * `other` or `maxSelections` is set.
 */
export function serializeFormFieldOptions(parsed: ParsedFormFieldOptions): unknown {
  const hasOther = !!parsed.other;
  const hasMax = typeof parsed.maxSelections === "number" && parsed.maxSelections > 0;

  if (!hasOther && !hasMax) {
    return parsed.options;
  }

  const wrapped: Record<string, unknown> = { options: parsed.options };
  if (hasOther) wrapped.other = parsed.other;
  if (hasMax) {
    wrapped.maxSelections = parsed.maxSelections;
    if (parsed.showSelectionCounter === false) {
      wrapped.showSelectionCounter = false;
    }
  }
  return wrapped;
}

/**
 * Resolves the "Other" choice's display label, picking AR or EN and
 * falling back to defaults if the admin didn't customize.
 */
export function resolveOtherLabel(
  other: OtherConfig | undefined,
  lang: "en" | "ar"
): string {
  if (!other) return "";
  if (lang === "ar") return other.labelAr || OTHER_DEFAULTS.labelAr;
  return other.label || OTHER_DEFAULTS.label;
}

export function resolveOtherPlaceholder(
  other: OtherConfig | undefined,
  lang: "en" | "ar"
): string {
  if (!other) return "";
  if (lang === "ar") return other.placeholderAr || OTHER_DEFAULTS.placeholderAr;
  return other.placeholder || OTHER_DEFAULTS.placeholder;
}

/** Whether the field's stored value indicates the "Other" choice. */
export function valueContainsOther(raw: unknown): boolean {
  if (raw === OTHER_VALUE) return true;
  if (Array.isArray(raw)) return raw.includes(OTHER_VALUE);
  return false;
}

/** Read the sibling custom text from a full submission/metadata blob. */
export function readOtherText(
  fieldName: string,
  allData: Record<string, unknown> | null | undefined
): string {
  if (!allData) return "";
  const sibling = allData[`${fieldName}${OTHER_SUFFIX}`];
  if (typeof sibling !== "string") return "";
  return sibling.trim();
}
