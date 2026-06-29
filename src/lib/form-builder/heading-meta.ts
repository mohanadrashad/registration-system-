// Section-heading (HEADING field) config stored in FormField.metadata — no
// dedicated column needed. v1 holds an optional label color the admin picks in
// the form builder. Read defensively: a missing/garbage value renders as the
// default muted label, so an invalid stored color can never break the page.

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Extract a valid 6-digit hex label color from a HEADING field's metadata. */
export function parseHeadingColor(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const c = (metadata as { color?: unknown }).color;
    if (typeof c === "string" && HEX6.test(c)) return c;
  }
  return null;
}
