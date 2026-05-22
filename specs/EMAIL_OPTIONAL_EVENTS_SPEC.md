# Email-Optional Events — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation in 3 sequential stages. Builds on the existing module system and form-builder.
**Prerequisites:** All previous features deployed and stable in production (Phase-Based Forms, Phase Selections, Category Phases, FILE field stages 1-3).

---

## Overview

Today every event requires every attendee to provide an email address. The `Contact.email` column is `NOT NULL` and `@unique([eventId, email])`. When a registration form doesn't collect email (which the form-builder currently allows by removing the field), the registration endpoint synthesizes a placeholder like `guest-baab607f1ed12e7a@noemail.local` to satisfy the constraint.

This creates two problems. First, the admin dashboard surfaces these synthetic emails as if they were real data — attendees list rows show `guest-xxx@noemail.local` with no name, no organization, looking like broken data instead of a deliberate event configuration. Second, downstream features (email campaigns, badge delivery) try to send to these unroutable addresses, wasting API calls and risking provider reputation.

The underlying issue is that some events legitimately don't need email. A walk-in product expo, a one-day workshop with no follow-up, an internal company gathering — these collect a registration, hand out a badge, and end there. No portal, no campaigns, no email-delivered badges. Forcing email on these events is friction for the visitor and creates fake data in the admin's view.

This spec makes email collection a first-class event-level decision tied to the existing `selfServicePortal` module. When the portal is off, the form admin can collect email as optional (or remove it entirely). When the portal is on, email is required because the OTP login depends on it. The dashboard, campaign, and badge-delivery systems treat missing email gracefully instead of pretending the synthetic placeholder is real data.

---

## Goals

- Email is required on the registration form when `selfServicePortal = true`, optional when `selfServicePortal = false`.
- The form-builder enforces this — when portal is on, the email field's "required" toggle is disabled and explained via tooltip.
- When email is genuinely absent (visitor skipped the optional field), the dashboard displays the row cleanly — no synthetic-email string shown, fallback to confirmation code as the identifier when name is also absent.
- Email campaigns skip contacts with no real email and log each skip with a clear reason. Campaign summary surfaces the skipped count.
- Badge delivery emails skip contacts with no real email, but the badge PDF is still generated for in-person check-in.
- A new helper `isSyntheticEmail(email: string): boolean` becomes the single source of truth for "is this email real" across the codebase.
- Existing events with synthetic-email contacts continue working — the new display logic applies to them retroactively without data migration.

## Non-Goals

- Making `Contact.email` nullable at the schema level. Constraint stays. Synthetic emails still get written, just displayed differently and treated honestly by downstream code.
- Admin filling in missing emails or other fields from the dashboard. That's the follow-on `ADMIN_EDIT_VISITOR_DATA_SPEC.md` project, which builds on this one.
- Re-running synthetic-email replacement (turning `guest-xxx@noemail.local` into a real address when admin later fills it in). Belongs in the admin-edit spec.
- Per-event override of "portal on but email not required" or "portal off but email forced required across all forms." The relationship between portal and email-required is mechanical (portal needs email for OTP), not configurable.
- Schema migration to backfill synthetic-email status flags on existing contacts. The `isSyntheticEmail` helper inspects the email string at runtime — no flag column needed.
- Multilingual changes to the "No email provided" UI copy. Admin UI is English-only per `CLAUDE.md`.

---

## Architecture

### `isSyntheticEmail` helper

The canonical check for "is this email a placeholder" lives in `src/lib/contact/synthetic-email.ts` (new file):

```ts
const SYNTHETIC_EMAIL_DOMAIN = "noemail.local";
const SYNTHETIC_EMAIL_PREFIX = "guest-";

export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`) && email.startsWith(SYNTHETIC_EMAIL_PREFIX);
}

export function generateSyntheticEmail(): string {
  // 16 hex chars of crypto random — matches existing pattern, just centralized here
  const hex = crypto.randomBytes(8).toString("hex");
  return `${SYNTHETIC_EMAIL_PREFIX}${hex}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
```

The audit step in Stage 1 confirms `isSyntheticEmail` doesn't already exist under a different name and finds every call site that currently inspects email strings ad-hoc.

### Form-builder email-required gating

When the form-builder loads the email field's edit settings:

- Read `event.modules.selfServicePortal`.
- If `selfServicePortal === true`: render the "Required" toggle as `checked + disabled` with a tooltip: `"Email is required when the self-service portal is enabled. Disable the portal module to make email optional."`
- If `selfServicePortal === false`: render the "Required" toggle as editable. Admin can mark it required or not.

The form-builder doesn't auto-toggle the field when the portal module is changed — the admin sees the constraint reflected next time they open the field's settings. (Alternative: enforce on save. See Stage 2 details.)

### Registration endpoint validation

`POST /api/register/[eventSlug]` continues accepting form submissions. When email is absent from the payload:

- If `event.modules.selfServicePortal === true`: return 400 with `{ error: "Email is required for this event", code: "EMAIL_REQUIRED" }`. The form-builder gating should have prevented this from being possible client-side, but the server validates as defense in depth.
- If `event.modules.selfServicePortal === false`: synthesize an email using `generateSyntheticEmail()`, proceed normally.

The form's per-field `required` flag also enforces — if email is marked required and missing, 400. The portal check is a stronger override that fires regardless of how the form is configured.

### Dashboard display

Two surfaces:

**Attendees table** (`src/components/events/attendees-table.tsx` or equivalent):

- Email column: if `isSyntheticEmail(contact.email)`, render `—` (em-dash) in muted color. Otherwise render the email.
- Name column: if first + last are both empty, render `Reg #${confirmationCode.slice(0, 8)}` in muted color. Otherwise render the name normally.
- No row-level "anonymous" badge. The em-dash signals the data shape without adding visual noise.

**Attendee detail page header** (`src/app/(dashboard)/dashboard/events/[eventId]/attendees/[contactId]/page.tsx`):

- If `isSyntheticEmail(contact.email)`, show a small muted indicator under the page title: `No email provided`. Otherwise no indicator.
- Email field in the identity card: if synthetic, render `—`. Otherwise render the email.

**CSV export:**

- Email column: if `isSyntheticEmail(contact.email)`, output an empty cell. Otherwise output the email.
- Other columns unchanged.

### Email campaign skip logic

In `src/lib/services/email.service.ts` (campaign send orchestration):

- For each recipient contact:
  - If `isSyntheticEmail(contact.email)`: create `EmailLog` row with `status: SKIPPED`, `errorMessage: "No email on record"`. Do not call the email provider. Increment campaign's `skippedCount` (new field on `EmailCampaign`).
  - Otherwise: send normally.

A new `EmailLogStatus` enum value: `SKIPPED`. New `EmailCampaign.skippedCount Int @default(0)`. Both require Prisma migrations.

Campaign summary UI shows `Sent: 47 · Failed: 0 · Skipped: 3 (no email)` instead of today's two-column layout.

### Badge delivery skip logic

In the registration flow after `Registration` is created (and again from any "re-send badge" admin trigger):

- If badge delivery email would fire:
  - If `isSyntheticEmail(contact.email)`: don't send. Don't set `badgeEmailSent`. Log to console or a dedicated table (TBD — see open questions).
  - Otherwise: send normally.

Badge PDF generation itself is unaffected — it always runs as part of the registration flow.

The attendee detail page shows the badge state:
- If `badgeGenerated && badgeEmailSent`: "Badge delivered" with timestamp.
- If `badgeGenerated && !badgeEmailSent && isSyntheticEmail(contact.email)`: "Badge generated — not delivered (no email on record)."
- If `badgeGenerated && !badgeEmailSent && !isSyntheticEmail(contact.email)`: "Badge generated — delivery pending" with a manual re-send button.
- If `!badgeGenerated`: existing copy.

---

## Schema Changes

Two small changes. Both purely additive — no existing rows affected.

### `EmailLogStatus` enum

Add `SKIPPED` as a new variant:

```prisma
enum EmailLogStatus {
  QUEUED
  SENT
  DELIVERED
  OPENED
  BOUNCED
  FAILED
  SKIPPED   // NEW — no send attempted, see errorMessage for reason
}
```

### `EmailCampaign.skippedCount`

```prisma
model EmailCampaign {
  // ... existing fields ...
  skippedCount Int @default(0)   // NEW
}
```

No other schema changes. `Contact.email` stays NOT NULL + unique-per-event. The `isSyntheticEmail` helper is a runtime check, not a column.

---

## Behavior Specifications

### Form-builder email field UX

When admin opens the email field's settings:

```
─── Field: Email ─────────────────────────────────

  Label (English)
  [Email                                          ]

  Label (Arabic)
  [البريد الإلكتروني                              ]

  ☑ Required          [ℹ️]
                       └─ tooltip: "Email is required when the
                          self-service portal is enabled. Disable
                          the portal module to make email optional."

  Width
  [Full Width                                  ▾]
```

Tooltip only renders when `selfServicePortal === true`. When portal is off, the Required checkbox is editable and no tooltip appears.

### Module toggle: turning portal on for an existing event

If admin enables `selfServicePortal` on an event that previously had email as optional:

- The form-builder will show email as required + disabled next time admin opens the field.
- Existing registrations with synthetic emails are NOT modified. They remain in the data.
- New registrations after the toggle must provide email (server enforces).
- Existing synthetic-email contacts cannot log into the portal (OTP requires a real email). The admin will need to fill in their emails via the upcoming admin-edit feature, or those attendees won't get portal access.

This is the right behavior — turning on the portal mid-event is an explicit admin choice with a known consequence.

### Module toggle: turning portal off for an existing event

If admin disables `selfServicePortal` on an event that previously required email:

- The form-builder unlocks the email field's Required toggle.
- Existing registrations are unaffected.
- New registrations may submit without email (if admin marks it optional).
- Portal stops working for everyone — existing logged-in sessions remain valid until their 24h cookie expires; no new OTP requests succeed.

### CSV export

The Stage 2 work from FILE field migrated CSV export to use `/api/events/[eventId]/registrations/export`. That route's `formatCell` function is where the synthetic-email handling lands:

```ts
// In formatCell or equivalent:
if (column === "email" && isSyntheticEmail(value)) {
  return "";
}
```

No other CSV behavior changes.

### Campaign builder UI

When admin opens the campaign builder and selects recipients, the recipient count summary shows:

`Recipients: 50 total · 47 with email · 3 without email (will be skipped)`

This is informational, not a blocker. Admin can launch the campaign anyway. After it completes, the summary updates to show actual `sent / failed / skipped` counts.

---

## Implementation Stages

Each stage is mergeable on its own. Verified on staging before the next.

### Stage 1 — Helper + audit

The plumbing layer. No user-visible change.

- Create `src/lib/contact/synthetic-email.ts` with `isSyntheticEmail` and `generateSyntheticEmail`.
- Audit the codebase for every place that currently:
  - Checks if an email starts with `guest-` or ends with `@noemail.local` (ad-hoc synthetic detection).
  - Generates synthetic emails inline.
  - Reads `contact.email` for display purposes.
- Report findings in the PR description. Identify which surfaces need updating in Stages 2 and 3.
- Refactor synthetic-email generation in the registration endpoint to use the new helper.
- No new behavior. Pure refactor + new helper.
- **Deliverable:** `isSyntheticEmail` is the canonical check. Audit findings document every Stage 2/3 surface.

### Stage 2 — Form-builder gating + registration validation

The admin-facing and write-path layer.

- Form-builder: when admin opens the email field's settings, check `event.modules.selfServicePortal`. If true, render Required as checked + disabled with tooltip.
- Add Zod validation to the form-field update endpoint: if the field is `name === "email"` and `event.modules.selfServicePortal === true`, reject any payload where `required !== true`.
- Registration endpoint: if `selfServicePortal === true` and email is absent from payload, return 400 with `code: "EMAIL_REQUIRED"`. If false, synthesize via the helper from Stage 1.
- No display changes yet — Stage 3 covers dashboard, campaigns, badge.
- **Mockup required** before code: the email field's "Required + disabled + tooltip" state in the form-builder. Small visual but worth confirming before implementation.
- **Deliverable:** admin can configure email-optional events. Server enforces correctly. No dashboard or downstream changes yet.

### Stage 3 — Display + downstream behavior

The user-visible payoff stage. Three commits, one per surface area.

**Commit A — Dashboard display:**
- Attendees table: synthetic email → `—`, empty name → `Reg #XXXXXXXX`.
- Attendee detail page header: muted "No email provided" indicator when synthetic.
- Identity card on attendee detail: email field shows `—` when synthetic.
- CSV export: synthetic email → empty cell.

**Commit B — Email campaigns:**
- Schema migration: add `SKIPPED` to `EmailLogStatus`, add `skippedCount` to `EmailCampaign`.
- Send orchestration: skip synthetic-email contacts, log with reason, increment counter.
- Campaign builder UI: show "X with email · Y without email (will be skipped)" in recipient summary.
- Campaign result UI: show the three counts (sent / failed / skipped) instead of two.

**Commit C — Badge delivery:**
- Registration flow: don't trigger badge email send when email is synthetic. Badge PDF still generates.
- "Re-send badge" admin action: refuse with toast "No email on record" when synthetic.
- Attendee detail page: show the new badge state copy depending on `badgeEmailSent`, `badgeGenerated`, and `isSyntheticEmail(email)`.

**Smoke test for Stage 3** (manual browser, similar to FILE field smoke tests):
1. Create a staging event with `selfServicePortal = false`.
2. Mark email as optional in the form-builder.
3. As a visitor, submit a registration without email. Confirm 200 success.
4. As admin, check the attendees table — synthetic-email row shows `—`, name fallback shows confirmation code.
5. CSV export — confirm the row has empty email cell.
6. Create an email campaign for the event. Confirm recipient summary shows "1 without email (will be skipped)".
7. Send the campaign. Confirm one EmailLog row has `status: SKIPPED`, `errorMessage: "No email on record"`. Campaign's `skippedCount: 1`.
8. Check the attendee detail page. Confirm badge generated, badge delivery state shows "not delivered (no email on record)."
9. Toggle `selfServicePortal` to true. Open the form-builder, confirm email field's Required toggle is disabled with tooltip.
10. As a visitor on a fresh session, submit without email. Confirm 400 with code `EMAIL_REQUIRED`.

**Deliverable:** end-to-end email-optional events working. Dashboard clean, campaigns skip gracefully, badges generate but don't email.

---

## Quality Disciplines

### Single-migration feature

Stage 3's schema changes are purely additive (new enum value, new int column with default). No backfill needed. Single Prisma migration.

### Mockup before code

Stage 2's form-builder change (the "Required + disabled + tooltip" state) needs a quick ASCII or screenshot mockup approved before implementation. Stage 3's dashboard changes also benefit from a mockup of the attendees table row in its em-dash state.

### Pre-flight audit

Stage 1's whole purpose is the audit. Surface findings before any other stage starts. Specifically:
- Confirm `Contact.email` is referenced in the codebase, and identify every read path that displays it to a user (admin or attendee).
- Confirm `guest-` and `noemail.local` aren't already special-cased somewhere we missed.
- Confirm the registration endpoint's current synthetic-email generation pattern (so the helper drop-in matches).
- Confirm no campaigns are currently being sent that would have synthetic-email recipients (so we don't break in-flight work).

### No new infrastructure

Same as the FILE field feature. No new services, no new env vars, no new cron entries.

### Backwards compatibility

- Existing events with `selfServicePortal = true` continue requiring email (no change).
- Existing events with synthetic-email contacts (from when the form-builder allowed dropping email) display correctly under the new logic — the helper inspects the email string, no flag column needed.
- Existing in-flight campaigns running against synthetic-email contacts will start producing `SKIPPED` logs after Stage 3 ships. This is the intended behavior.

---

## Acceptance Criteria

### Stage 1
- [ ] `isSyntheticEmail` and `generateSyntheticEmail` exist in `src/lib/contact/synthetic-email.ts`.
- [ ] Registration endpoint refactored to use `generateSyntheticEmail`.
- [ ] PR description includes audit findings for every email-display surface, every ad-hoc synthetic detection, every synthetic generation site.
- [ ] No behavior change for any existing event or registration flow.

### Stage 2
- [ ] Mockup of the email-field "Required + disabled + tooltip" state approved before code.
- [ ] Form-builder disables Required toggle on email field when portal module is on, with tooltip.
- [ ] Zod validation on form-field update rejects unchecking Required on email when portal is on.
- [ ] Registration endpoint returns 400 with `code: "EMAIL_REQUIRED"` when portal is on and email is absent.
- [ ] Registration endpoint synthesizes via helper when portal is off and email is absent.
- [ ] No display changes (Stage 3 scope).

### Stage 3
- [ ] Attendees table renders `—` for synthetic emails, falls back to confirmation code when name is empty.
- [ ] Attendee detail page header shows "No email provided" indicator when synthetic.
- [ ] CSV export has empty cell for synthetic-email rows.
- [ ] Schema migration adds `SKIPPED` to `EmailLogStatus` and `skippedCount` to `EmailCampaign`.
- [ ] Campaign send creates `SKIPPED` log entries for synthetic-email contacts and doesn't call the email provider.
- [ ] Campaign recipient summary shows the "with email / without email" breakdown.
- [ ] Campaign result UI shows three counts: sent / failed / skipped.
- [ ] Badge PDF still generates for synthetic-email contacts. Badge delivery email is skipped silently.
- [ ] Manual "Re-send badge" refuses with toast for synthetic-email contacts.
- [ ] Attendee detail badge state shows the new three-state copy.
- [ ] Full smoke test from the spec passes on staging.

### Whole feature
- [ ] All 3 stages deployed and verified on staging.
- [ ] No existing event required manual admin action to keep working.
- [ ] Existing synthetic-email contacts (if any) display correctly without data migration.
- [ ] Module toggle (portal on/off) behavior matches spec for both directions.

---

## Open Questions

These are minor and can be decided during implementation, but Claude Code should surface its choice in each PR description rather than silently picking.

1. **Where to log skipped badge-delivery attempts.** Email campaigns log to `EmailLog` because there's a campaign context. Badge delivery is a one-off send; there's no campaign. Three options:
   - Add `EmailLog` rows with `campaignId: null` for badge delivery (existing schema allows null).
   - Add a new `BadgeDeliveryLog` table.
   - Just console.log it.
   Default: option A (use existing `EmailLog`, null campaign). Cheapest and gives admin a single place to inspect "why didn't this person get any emails."

2. **The "Re-send badge" button when email is synthetic.** Today the button always shows. After this spec, should it hide entirely or show as disabled with explanation? Default: show as disabled with tooltip "No email on record." Educates the admin about the data state.

3. **Form-builder enforcement on save vs on edit.** Today the form-builder can save email as not-required even when portal is on. After this spec, do we (a) prevent save with a clear error, or (b) auto-coerce required to true and warn? Default: option (a) — fail with clear error. Auto-coercion hides intent.

4. **What if the admin removes email from the form entirely when portal is on?** The Required toggle gating only applies when the field exists. If admin deletes the field, the visitor never sees it, and the registration endpoint returns 400 EMAIL_REQUIRED. Two options: (a) block field deletion when portal is on, or (b) allow deletion and let the registration endpoint's 400 catch it. Default: option (a) — block at form-builder level with clear error. Prevents footgun.

5. **Synthetic email format change resilience.** The helper checks for `guest-` prefix and `@noemail.local` suffix. If a future change to the synthesis format ships, the helper needs to be updated to recognize both old and new patterns until a backfill happens. Document this requirement in the helper file as a comment for future maintainers.

---

## Notes for Claude Code

- Stage 1 is mostly audit. Surface findings explicitly — they shape Stage 2 and Stage 3 chunks.
- Stage 2's mockup is small but real. Don't skip it.
- Stage 3 has three commits inside one stage. That's deliberate — each surface (dashboard / campaigns / badges) is independent enough to verify separately but related enough to ship together.
- Honor existing patterns: services in `src/lib/services/`, validations in `src/lib/validations/`, helpers in `src/lib/contact/`.
- The `isSyntheticEmail` helper is a hot-path function (called for every contact in display loops and campaign sends). Keep it cheap — string operations only, no DB hits, no async.
- Do not modify `Contact.email` schema. The constraint stays. The runtime check is what changes.
- Do not add tests unless explicitly asked.
- One commit per chunk within each stage. Push each stage as its own PR.
- Smoke test in Stage 3 is the end-of-feature gate. Don't skip it — the campaign-skip path is the most novel piece.

---

*Approved for implementation, stage by stage, with staging verification between stages.*
