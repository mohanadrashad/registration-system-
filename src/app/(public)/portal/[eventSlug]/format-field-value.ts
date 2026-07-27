import { COUNTRIES } from "@/lib/form-builder/countries";
import { pickText, type PortalLang } from "@/lib/portal/i18n";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import { PORTAL_STRINGS } from "./portal-strings";
import type { FormFieldDef } from "./types";

// Format a stored answer for read-only display in the "Your Details" card:
// resolves option labels (bilingual), COUNTRY codes, booleans, and the
// "Other: <text>" composite from the sibling _other key.
export function formatFieldValue(
  field: FormFieldDef,
  raw: unknown,
  lang: PortalLang,
  allData?: Record<string, unknown> | null
): string {
  const t = PORTAL_STRINGS[lang];
  if (raw === undefined || raw === null || raw === "") return "-";

  const parsed = parseFormFieldOptions(field.options);
  const otherLabel = parsed.other
    ? resolveOtherLabel(parsed.other, lang)
    : "Other";
  const sibling = allData?.[`${field.name}${OTHER_SUFFIX}`];
  const otherText = typeof sibling === "string" ? sibling.trim() : "";
  const renderOther = () =>
    otherText ? `${otherLabel}: ${otherText}` : otherLabel;

  if (Array.isArray(raw)) {
    return raw
      .map((v) => {
        if (v === OTHER_VALUE) return renderOther();
        const opt = parsed.options.find((o) => o.value === v);
        if (!opt) return String(v);
        return pickText(lang, opt.label, opt.labelAr ?? undefined);
      })
      .join(", ");
  }
  if (typeof raw === "boolean") return raw ? t.yes : t.no;
  if (field.type === "COUNTRY") {
    const country = COUNTRIES.find((c) => c.code === raw);
    if (country) return lang === "ar" ? country.nameAr : country.name;
  }
  if (raw === OTHER_VALUE) return renderOther();
  if (parsed.options.length > 0) {
    const opt = parsed.options.find((o) => o.value === raw);
    if (opt) return pickText(lang, opt.label, opt.labelAr ?? undefined);
  }
  return String(raw);
}
