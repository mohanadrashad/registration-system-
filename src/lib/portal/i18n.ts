/**
 * Portal-side bilingual primitives.
 *
 * Two pages and one component on the portal need the same language
 * primitives: the landing page, the phase fill page, and the
 * PhaseOptionsCard. Centralising the type + the pick helper here keeps
 * them from drifting if a third surface lands later.
 *
 * The portal post-login flow doesn't have a translation infrastructure
 * (i18next, intl, react-intl, etc.) — page-level PAGE_STRINGS objects
 * inline the static UI strings per page. If a third language ever ships,
 * lift those into a shared module too.
 */

export type PortalLang = "ar" | "en";

/**
 * Pick the Arabic value when lang=ar AND it's non-empty, otherwise fall
 * back to English. Authors can leave Arabic blank without breaking the
 * rendering — they'll see the English variant rather than an empty
 * label.
 */
export function pickText(
  lang: PortalLang,
  en: string | null | undefined,
  ar: string | null | undefined
): string {
  if (lang === "ar") {
    const v = (ar ?? "").trim();
    if (v) return v;
  }
  return en ?? "";
}

/**
 * BCP-47 locale tag derived from the portal language. Used with
 * `Date.toLocaleString(localeTag(lang))` so Arabic users see Arabic
 * numerals + Arabic month names. Returns undefined for English so the
 * browser default locale wins (matches existing UI).
 */
export function localeTag(lang: PortalLang): string | undefined {
  return lang === "ar" ? "ar-SA" : undefined;
}
