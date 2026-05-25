/**
 * Format a Date / ISO string / ms epoch as a human-readable relative
 * time ("just now", "5 minutes ago", "3 days ago"). Past ~14 days
 * the output flips to a short absolute date ("May 24") because
 * "47 days ago" is harder to read than the date itself.
 *
 * Future dates (clock skew, scheduled-publish edge cases) get
 * absolute formatting too — "in 3 hours" risks misleading admins
 * if a clock is off, and the use cases that drive this helper
 * (audit timestamps, run results) are always past-events in
 * practice.
 *
 * All output is English-only by design. The audit surfaces that
 * consume this (attendee header, backfill result modal) are
 * admin-only and the dashboard is English-only; if a future
 * attendee-facing surface needs this, swap to
 * `Intl.RelativeTimeFormat` with the active locale.
 */
export function formatRelativeTime(
  input: Date | string | number,
  now: Date = new Date()
): string {
  const then = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(then.getTime())) return "—";

  const deltaMs = now.getTime() - then.getTime();
  const deltaSec = Math.floor(deltaMs / 1000);

  // Future / clock-skew: fall through to absolute format.
  if (deltaSec < 0) return formatShortDate(then);

  if (deltaSec < 45) return "just now";

  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin} minute${deltaMin === 1 ? "" : "s"} ago`;

  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr} hour${deltaHr === 1 ? "" : "s"} ago`;

  const deltaDay = Math.floor(deltaHr / 24);
  if (deltaDay < 14) return `${deltaDay} day${deltaDay === 1 ? "" : "s"} ago`;

  return formatShortDate(then);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
