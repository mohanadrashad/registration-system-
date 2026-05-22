import { randomBytes } from "crypto";

// Synthetic email format: `guest-<16 hex chars>@noemail.local`.
//
// Why both prefix AND suffix are required for the check: the suffix alone
// (the original detection in field-display.ts) would wrongly flag a paste-
// test like `foo@noemail.local` as synthetic. The prefix is what proves the
// address was machine-minted by this codebase, not user-supplied.
//
// If the synthesis format ever changes (new prefix, new domain, longer
// hash), this helper must recognize BOTH the old and the new pattern until
// every existing row has been backfilled — otherwise dashboard/CSV/campaign
// surfaces will start treating legacy synthetic rows as real emails again.
export const SYNTHETIC_EMAIL_DOMAIN = "noemail.local";
export const SYNTHETIC_EMAIL_PREFIX = "guest-";

export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (
    email.startsWith(SYNTHETIC_EMAIL_PREFIX) &&
    email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)
  );
}

export function generateSyntheticEmail(): string {
  const hex = randomBytes(8).toString("hex");
  return `${SYNTHETIC_EMAIL_PREFIX}${hex}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
