import { z } from "zod";

/**
 * Branding upsert validation.
 *
 * Existing fields stay permissive (optional / nullable strings) so this
 * schema preserves the route's prior raw-destructure behavior exactly — no
 * previously-accepted payload starts failing. Feature A's three new header
 * fields carry real constraints: a hex `headerColor`, a boolean show/hide
 * switch, and a `logoHeight` that is CLAMPED (not rejected) to the safe strip
 * range so a future slider can never persist a value that breaks the header.
 *
 * Spec: REGISTRATION_CUSTOMIZATION_SPEC §5 (Feature A).
 */

export const LOGO_HEIGHT_MIN = 24;
export const LOGO_HEIGHT_MAX = 80;

const hexColor = z
  .string()
  .trim()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Must be a hex color like #0c0c0e"
  );

// Empty string from a cleared input is treated as null (clear the override).
const headerColorField = z
  .preprocess((v) => (v === "" ? null : v), hexColor.nullable())
  .optional();

// Clamp rather than reject — A3 says "clamp 24–80 at the API". null clears.
const logoHeightField = z
  .number()
  .int()
  .transform((n) => Math.min(LOGO_HEIGHT_MAX, Math.max(LOGO_HEIGHT_MIN, n)))
  .nullable()
  .optional();

export const brandingUpdateSchema = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().nullish(),
  backgroundColor: z.string().nullish(),
  textColor: z.string().nullish(),
  logoUrl: z.string().nullish(),
  logoWhiteUrl: z.string().nullish(),
  faviconUrl: z.string().nullish(),
  headerImageUrl: z.string().nullish(),
  // ── Feature A (header & logo controls) ──
  headerColor: headerColorField,
  headerShowLogo: z.boolean().optional(),
  logoHeight: logoHeightField,
  // ── Content ──
  customCss: z.string().nullish(),
  welcomeTitle: z.string().nullish(),
  welcomeTitleAr: z.string().nullish(),
  welcomeMessage: z.string().nullish(),
  welcomeMessageAr: z.string().nullish(),
  footerText: z.string().nullish(),
  footerTextAr: z.string().nullish(),
});

export type BrandingUpdateInput = z.infer<typeof brandingUpdateSchema>;
