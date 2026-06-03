/**
 * Header auto-contrast helper (Feature A, REGISTRATION_CUSTOMIZATION_SPEC).
 *
 * Picks readable text (near-black vs white) for a given background hex by
 * relative luminance, so the registration header's title/text stays legible
 * whatever `headerColor` an admin sets. The text color is DERIVED here, never
 * stored — there is no separate "header text color" setting.
 *
 * Shared by the public registration header (Stage 1) and the admin Header-card
 * live preview (Stage 2).
 */

// Near-black echoes the default header strip rather than pure #000.
const NEAR_BLACK = "#0c0c0e";
const WHITE = "#ffffff";

// Parse #rgb or #rrggbb → [r, g, b] in 0–255, or null if unparseable.
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0 = black … 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  // Treat an unparseable color as dark → white text (the safe default that
  // preserves today's dark-header look).
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * True when white text has better contrast than near-black on this background.
 * Threshold 0.179 is the WCAG break-even point between contrast-vs-white and
 * contrast-vs-black (derived from the contrast-ratio formula).
 */
export function prefersWhiteText(hex: string): boolean {
  return relativeLuminance(hex) < 0.179;
}

/** Readable text color (near-black or white) for a given background hex. */
export function readableTextColor(hex: string): string {
  return prefersWhiteText(hex) ? WHITE : NEAR_BLACK;
}
