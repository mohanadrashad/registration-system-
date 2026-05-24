# Field Mapping — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation in 3 sequential stages. Builds on the existing FormField / Contact registration pipeline.
**Prerequisites:** Phase-Based Forms, Phase Selections, Attendee Detail Redesign, Category-Based Phase Logic, FILE field, Email-Optional Events, and Admin-Edit-Fix Stages 1–3 (backend) are deployed and stable in production.

---

## Overview

The registration endpoint populates `Contact.firstName`, `lastName`, `email`, `phone`, `organization`, and `designation` by literal-key destructuring of the submitted `formData`. Today the endpoint reads `body.firstName`, `body.lastName`, and so on — it assumes the FormField named `firstName` always contains a first name. That assumption breaks the moment an admin builds a form with fields named anything else.

The Productive Families event is exactly this case. Visitors register through fields named "First Name", "Middel Name", and "Third Name". None of those keys match the destructure, so every new Contact lands with `firstName = ""` and `lastName = ""`, and the dashboard list falls back to rendering `Reg #cmpgck5x` instead of real names.

This spec introduces **field mapping**: each `FormField` can carry a `mapsTo` tag declaring which Contact column its value populates. The registration endpoint reads the tags and assembles Contact column values from the mapped fields. When no field is tagged for a role, the endpoint falls back to today's literal-key behavior. Existing events keep working without admin action.

It also closes a latent bug: `phone`, `organization`, and `designation` are non-system fields that admins can rename through the form-builder. Renaming silently breaks the Contact-column write today, because the destructure still looks for the original literal keys. Mapping eliminates this name-coupling.

---

## Goals

- An admin can tag any `FormField` with a `mapsTo` role from a fixed enum. Tags are set in the form-builder.
- The registration endpoint reads the tags and assembles Contact column values from mapped fields. Multiple fields can map to `LAST_NAME` (concatenated); other roles accept at most one mapping.
- A `FULL_NAME` role is supported for single-input "Full Name" forms — splits on first whitespace into `firstName` (head) and `lastName` (rest).
- When no field is tagged for a role, the endpoint falls back to today's literal-key lookup (`formData["firstName"]`, etc.). No existing event needs admin action.
- Renaming a tagged field in the form-builder no longer breaks the Contact-column write. The mapping is the binding, not the field name.
- An admin can run a one-shot backfill that retroactively populates Contact columns for existing registrations using the current mapping. Preview shows what will change before the admin commits.
- Backfill is idempotent. Re-running with the same mapping is a no-op.
- The dashboard list shows real names instead of `Reg #cmpgck5x` once the admin tags fields for any event built with non-standard field names.

## Non-Goals

- CATEGORY mapping. Deferred to v2. The category column has its own validation rules (value must exist in `Event.categories`) that need separate design.
- `MIDDLE_NAME` as a separate role. Deferred to v2. Today multi-part names (e.g. Productive Families' "First Name" / "Middel Name" / "Third Name") are handled by tagging the middle and last fields as `LAST_NAME` and letting the join logic concatenate them. The dashboard list rendering — which displays `<firstName> <lastName>` — is correct regardless of which column holds the middle name. If a future event requires middle-name separation for filtering, sorting, or culturally-specific name rendering, add `Contact.middleName String?` + a `MIDDLE_NAME` enum value as a small additive change. The mapping system was designed to make this fast-follow trivial: one column, one enum value, no breaking change.
- Per-field type coercion or normalization beyond what already exists. Email continues to lowercase; phone, organization, designation remain raw pass-through. Mapping changes *which* field's value goes into the column, not *how* the value is processed.
- Modifying the CSV import path. Mapping is form-submission-only. CSV import already writes Contact columns directly.
- Multiple FULL_NAME fields. The role is single-value.
- Auto-detection or magic inference of mappings. Admins must tag explicitly. The legacy fallback is the only implicit behavior.
- A second admin-facing "Field Mapping" page or top-level config surface. Tags live next to the fields they describe, in the form-builder.

---

## Architecture

One enum, one column, one summary card in the form-builder, two new code paths in the register endpoint (read-side mapping + backfill).

`FormField.mapsTo` is a nullable enum column. Most fields stay null (decorative fields, file uploads, custom data collection). Only the six fields that drive Contact columns carry a tag.

The registration endpoint resolves each Contact column in this order:

```
For each role in {FIRST_NAME, LAST_NAME, EMAIL, PHONE, ORGANIZATION, DESIGNATION}:
  1. Find FormFields in this event tagged mapsTo = role, ordered by FormField.order
  2. If found:
       - LAST_NAME with multiple matches → join values with space, skip empty/null
       - Single-value roles with one match → use that value
  3. Else if any field tagged FULL_NAME exists (only relevant for FIRST_NAME and LAST_NAME):
       - Split FULL_NAME value on first whitespace → head=firstName, rest=lastName
  4. Else: read formData[<legacy_key>] where legacy_key matches today's destructure
  5. Else: null (or empty string for NOT NULL columns)
```

Email retains its `toLowerCase()` and synthetic-email synthesis. Phone, organization, designation remain raw pass-through. The mapping changes the input to these steps, not the steps themselves.

Backfill is a one-shot administrative operation triggered from the form-builder. It walks all `Registration` rows for the event, runs the same resolution logic against each row's `formData`, computes what would change, shows a preview, and on confirm writes the diffs.

---

## Schema Changes

### `FormField` model — additions

```prisma
model FormField {
  // ... existing fields preserved ...

  mapsTo  FieldMapping?  // null = no mapping; field is form-only
}

enum FieldMapping {
  FIRST_NAME       // single; → Contact.firstName
  LAST_NAME        // multiple allowed; joined in FormField.order → Contact.lastName
  FULL_NAME        // single; split on first whitespace → firstName + lastName
  EMAIL            // single; → Contact.email (lowercased + synthesis preserved)
  PHONE            // single; → Contact.phone
  ORGANIZATION     // single; → Contact.organization
  DESIGNATION      // single; → Contact.designation
}
```

Single Prisma migration. New column is nullable with no default — all existing FormField rows get `mapsTo = NULL` and legacy fallback handles them.

No index needed in v1. The mapping resolver runs once per registration, queried by `eventId` (already indexed via the existing `FormField.eventId` index). At Productive Families scale this is sub-millisecond.

### No other schema changes

`publicRegistrationSchema` in `src/lib/validations/registration.ts` is dead code (defined but never imported by the register endpoint, which enforces required-ness through the dynamic FormField loop instead). This spec does not touch it. Removing the dead schema is an optional cleanup that should happen in a separate small PR if desired.

---

## Behavior Specifications

### Tag uniqueness and mutual exclusivity

Enforced at the application layer in the form-builder save path (Zod validation on the PATCH endpoint):

- **Single-value roles** (FIRST_NAME, FULL_NAME, EMAIL, PHONE, ORGANIZATION, DESIGNATION): at most one field per event may carry the tag. Save rejects with a clear error naming the conflicting field.
- **LAST_NAME**: multiple fields may carry the tag. No uniqueness check.
- **FULL_NAME mutual exclusion**: if any field is tagged FULL_NAME, no field may be tagged FIRST_NAME or LAST_NAME. And vice versa. Save rejects with: *"FULL_NAME is mutually exclusive with FIRST_NAME and LAST_NAME. Untag {fieldName} first."*

The uniqueness check is scoped per event. Two different events can independently tag their own EMAIL field.

### Resolution at registration time

The POST handler at `src/app/api/register/[eventSlug]/route.ts` is refactored to resolve Contact columns via a new helper. Pseudocode:

```ts
function resolveContactColumns(event, formData, body) {
  const fields = event.formFields; // already loaded for required-ness check
  const byRole = groupBy(fields.filter(f => f.mapsTo), f => f.mapsTo);

  // FIRST_NAME / LAST_NAME / FULL_NAME
  let firstName: string | null = null;
  let lastName: string | null = null;

  if (byRole.FULL_NAME?.[0]) {
    const raw = formData[byRole.FULL_NAME[0].name];
    if (typeof raw === "string" && raw.trim()) {
      [firstName, lastName] = splitFullName(raw);
    }
  } else {
    if (byRole.FIRST_NAME?.[0]) {
      firstName = readString(formData, byRole.FIRST_NAME[0].name);
    }
    if (byRole.LAST_NAME?.length) {
      const parts = byRole.LAST_NAME
        .sort((a, b) => a.order - b.order)
        .map(f => readString(formData, f.name))
        .filter(s => s && s.trim());
      lastName = parts.length ? parts.join(" ") : null;
    }
  }

  // Legacy fallback for unmapped roles
  if (firstName === null) firstName = readString(body, "firstName");
  if (lastName === null) lastName = readString(body, "lastName");

  // EMAIL / PHONE / ORGANIZATION / DESIGNATION
  const email = byRole.EMAIL?.[0]
    ? readString(formData, byRole.EMAIL[0].name)
    : readString(body, "email");

  const phone = byRole.PHONE?.[0]
    ? readString(formData, byRole.PHONE[0].name)
    : readString(body, "phone");

  // ...same shape for organization, designation
  // (email lowercase + synthesis logic stays at the existing site downstream)

  return { firstName, lastName, email, phone, organization, designation };
}
```

`splitFullName(raw)` returns `[head, rest]` where `head` is everything before the first whitespace character and `rest` is everything after (trimmed). If there is no whitespace, `rest = ""`. This matches the existing splitter at `route.ts:432-435`.

The existing fullName-fallback block (`route.ts:419-442`) is removed — the mapping resolver supersedes it. Behavior is preserved for events that submit a literal `fullName` field by adding a final fallback rung: if no field is tagged and `body.fullName` exists, run the splitter. (This keeps any legacy event that relies on the current fallback working without admin action.)

The downstream email normalization (`toLowerCase()`) and synthesis (`generateSyntheticEmail()`) stay where they are. Mapping resolves the *input* to those steps; the steps themselves are unchanged.

### Form-builder UI

Each FormField row in the form-builder gains a new control: **"Maps to"** dropdown. Options:

- *Not mapped* (default; renders as a muted "—")
- First Name
- Last Name
- Full Name
- Email
- Phone
- Organization
- Designation

The dropdown is filtered by field type compatibility:

- EMAIL role: visible only for `TEXT` and `EMAIL` field types
- PHONE role: visible only for `TEXT`, `PHONE`, and `PHONE_COUNTRY` field types
- All name roles (FIRST_NAME, LAST_NAME, FULL_NAME): visible only for `TEXT`
- ORGANIZATION, DESIGNATION: visible only for `TEXT`, `SELECT`, `RADIO`

Incompatible roles are hidden from the dropdown rather than disabled — keeps the menu short and the admin focused.

On save, the API enforces:

1. Field type compatibility (server-side mirror of the dropdown filter)
2. Single-value uniqueness per event
3. FULL_NAME mutual exclusion

Conflicts surface as inline errors on the field row with a **Swap** affordance: *"Email is already mapped to 'Work Email'. [Swap to this field]."* Clicking Swap unsets the other field's tag and sets this one in a single atomic PATCH. Pattern mirrors the existing reorder-swap pattern in `phase.service.ts`.

### Summary card

The form-builder gets a read-only summary card pinned at the top of the page, above the phase list:

```
┌────────────────────────────────────────────────────────────────┐
│ Field Mapping                                                  │
├────────────────────────────────────────────────────────────────┤
│ First Name    → "First Name"                                   │
│ Last Name     → "Middel Name" + "Third Name" (joined)          │
│ Email         → not mapped (falls back to field named "email") │
│ Phone         → not mapped                                     │
│ Organization  → not mapped                                     │
│ Designation   → not mapped                                     │
└────────────────────────────────────────────────────────────────┘
```

For each role: show the source field name, or "not mapped (falls back to field named `X`)" when null. LAST_NAME with multiple sources shows the join order. FULL_NAME, when active, replaces the FIRST_NAME and LAST_NAME rows with a single `Full Name → "..." (split on first space)` row.

When LAST_NAME has multiple sources, the join hint *also* includes a muted note about middle-name handling: *"Middle names are joined into Last Name. To split them, add a separate Middle Name role in v2."* This sets admin expectations correctly — they see that middle and last are conflated in the column and know the system was designed for that.

The summary card surfaces what the registration endpoint will actually do. It's the single source of truth admins can read before testing.

### Backfill operation

A **"Backfill from current mapping"** button appears in the form-builder, below the summary card, only when at least one field is tagged (otherwise there's nothing to backfill).

Click → opens a preview dialog. Server runs the resolver against every `Registration` for this event and computes:

```
For each registration:
  resolved = resolveContactColumns(event, registration.formData, registration.formData)
  diff = {}
  for each column in {firstName, lastName, email, phone, organization, designation}:
    if resolved[column] != contact[column]:
      diff[column] = { from: contact[column], to: resolved[column] }
  if diff is non-empty: record it
```

The preview shows three buckets:

- **Will update N contacts** (rows where at least one column differs from current Contact value and current value is empty/null)
- **Already correct: M contacts** (resolver produces the same value as already in Contact)
- **Skipped: K contacts** (resolver produces empty/null, or current value is non-empty and overwrite is off)

Toggle: **Overwrite non-empty values** (default OFF). When OFF, only fill columns that are currently empty/null. When ON, replace existing non-empty values with resolved ones.

**Email-specific rules in backfill:**

- Backfill skips rows where the resolved email is empty. It does not generate a synthetic email retroactively. Synthetic emails are for new registrations without one, not retroactive blanks.
- Backfill lowercases resolved emails before writing (mirrors runtime).
- If a Contact currently has a synthetic email (`isSyntheticEmail()` returns true) and the resolved email is real, the resolved email replaces the synthetic one *regardless of the overwrite toggle*. Synthetic emails are placeholders, not real data.

Confirm → server runs the writes in a single `prisma.$transaction` per registration batch (batches of 100). Failures are surfaced row-by-row in a result modal: *"42 of 47 updated. 5 failed (see details)."* — successful rows stay committed. Commit-what-worked semantics match the pattern from PROJECT_HANDOFF.md's CSV-drift fix.

Backfill is idempotent. Re-running with the same mapping and same data produces zero diffs ("Already correct: M, Will update: 0").

### Dashboard list display

No code change required. The dashboard list already reads `Contact.firstName` and `Contact.lastName`. Once mapping populates those columns correctly (for new registrations after Stage 2; for historical registrations after Stage 3 backfill), the list renders real names automatically.

### Module gating

Field mapping is **not** behind a module flag. It's a universal improvement to the registration pipeline that fixes a latent bug. Every event benefits; no event needs to opt in. The legacy fallback ensures zero-action backward compatibility.

---

## Admin UX

### Form-builder additions

1. **"Maps to" dropdown on each field row.** Compact, sits near the existing required/active toggles. Empty state shows "—" in muted gray.

2. **Summary card pinned above the phase list.** Six rows (FIRST_NAME, LAST_NAME, EMAIL, PHONE, ORGANIZATION, DESIGNATION) showing current mapping or fallback hint. FULL_NAME collapses the first two rows when active.

3. **"Backfill from current mapping" button** below the summary card. Only visible when at least one field is tagged. Click → preview dialog.

4. **Swap affordance on tag conflicts.** Inline error message + button when admin tries to apply a single-value tag that another field already holds. One click reassigns.

### Preview dialog (backfill)

Modal with three sections:

```
Backfill from current mapping

This will update Contact columns (firstName, lastName, email, phone, organization,
designation) for existing registrations using the current field mapping.

┌──────────────────────────────────────────────────────────────┐
│ Will update: 47 contacts                                     │
│ Already correct: 12 contacts                                 │
│ Skipped (no resolvable value): 3 contacts                    │
└──────────────────────────────────────────────────────────────┘

☐ Overwrite non-empty Contact values
   (Off by default — only fills empty columns. Synthetic emails are always
    replaced by resolved real emails regardless of this toggle.)

[Show details]   ← expands to per-row diff table

[ Cancel ]   [ Run backfill ]
```

Result modal post-run shows row-level success/failure with copyable error text. Closing the modal refreshes the dashboard list.

### Attendee detail page

No new UI. The existing attendee detail page already shows `Contact.firstName`, `lastName`, etc. — mapping fixes the upstream write, not the display.

---

## API Endpoints

### Existing endpoints — additions

```
PATCH  /api/events/[eventId]/form-fields/[fieldId]
    Accepts new optional `mapsTo` field. Validates type compatibility,
    single-value uniqueness, and FULL_NAME mutual exclusion. Returns 409
    with conflict details on uniqueness violation.

POST   /api/events/[eventId]/form-fields/[fieldId]/swap-mapping
    Atomic swap. Body: { from: { fieldId, mapsTo }, to: { fieldId, mapsTo } }
    Unsets `from.fieldId.mapsTo` and sets `to.fieldId.mapsTo = mapsTo` in
    a single transaction. Used by the Swap affordance.

POST   /api/register/[eventSlug]
    (Existing public endpoint.) Internal change only: replaces the literal
    destructure + fullName fallback with the resolveContactColumns helper.
    Request and response shapes unchanged.
```

### New endpoints

```
GET    /api/events/[eventId]/field-mapping/summary
    Returns the data the summary card renders:
    {
      mappings: {
        FIRST_NAME: { fields: [{id, name, label}], legacy: "firstName" },
        LAST_NAME: { fields: [...], legacy: "lastName" },
        // ...
        FULL_NAME: { field: {id, name, label} | null }
      }
    }

POST   /api/events/[eventId]/field-mapping/backfill/preview
    Body: { overwriteNonEmpty: boolean }
    Runs the resolver against every Registration without writing.
    Returns:
    {
      willUpdate: number,
      alreadyCorrect: number,
      skipped: number,
      diffs: [
        { registrationId, contactId, contactName, changes: { firstName: {from, to}, ... } }
      ]
    }
    Capped at 500 diffs in response; UI shows "and N more" if exceeded.

POST   /api/events/[eventId]/field-mapping/backfill/run
    Body: { overwriteNonEmpty: boolean, expectedWillUpdate: number }
    Server re-runs the preview to confirm `expectedWillUpdate` still matches
    (guards against admins running stale preview). Then applies updates in
    batches of 100 per transaction. Returns per-row success/failure.
```

All admin routes use `authorizeEvent(eventId, { role: "MANAGER" })`. Backfill is a destructive operation; require MANAGER not EDITOR.

### Validation (Zod, `src/lib/validations/field-mapping.ts`)

New file. Schemas for:

- `fieldMappingPatchSchema` — validates the `mapsTo` value against the enum and the field's type
- `backfillPreviewSchema` — validates the overwrite toggle
- `backfillRunSchema` — validates overwrite + expectedWillUpdate

---

## Implementation Stages

Each stage is a mergeable chunk. Verified on staging before the next.

### Stage 1 — Schema + form-builder tagging UI + summary card

- Single Prisma migration: add `FieldMapping` enum, add `mapsTo` column to `FormField` (nullable, no default).
- API: PATCH form-field endpoint accepts `mapsTo`; validates type compatibility, single-value uniqueness per event, FULL_NAME mutual exclusion. Returns 409 with conflict details.
- API: `/swap-mapping` endpoint for the swap affordance.
- API: `/field-mapping/summary` GET endpoint.
- Zod schemas in `src/lib/validations/field-mapping.ts`.
- Form-builder UI: "Maps to" dropdown on each field row, summary card pinned above phase list, swap affordance on conflicts.
- **No runtime change yet.** Tags are saved; registration endpoint still uses today's literal destructure.
- **Deliverable:** admins can tag fields and see the summary card. Tagging has no observable effect on registrations yet — that's Stage 2. Existing events unaffected.

### Stage 2 — Registration endpoint integration

- Extract `resolveContactColumns()` helper into `src/lib/services/field-mapping.service.ts` (or inline into the register route — pick during implementation, lean toward service for testability).
- Replace the destructure + fullName fallback block at `route.ts:188, 419-442` with the resolver.
- Preserve the literal `body.fullName` fallback as the final rung in the resolver chain (no admin action required for events relying on it today).
- Email lowercase + synthesis logic stays at its current site downstream of the resolver.
- Verify on the staging test event harness:
  - Tag fields → register a new visitor → confirm Contact columns populated correctly
  - Untag everything → register a new visitor → confirm legacy fallback still works
  - Tag FULL_NAME, submit "Mohamed Abdullah Al-Saud" → confirm `firstName = "Mohamed"`, `lastName = "Abdullah Al-Saud"`
  - Tag two fields as LAST_NAME → confirm join order matches `FormField.order`
- **Deliverable:** new registrations on tagged events populate Contact columns correctly. Productive Families launch blocker resolved for new visitors. Historical visitors still show `Reg #...` — that's Stage 3.

### Stage 3 — Backfill with preview

- API: `/field-mapping/backfill/preview` and `/field-mapping/backfill/run` endpoints.
- Resolver reused from Stage 2 — no duplicate logic.
- Form-builder UI: "Backfill from current mapping" button under summary card, preview dialog, result modal.
- Email-specific rules: skip empty resolved emails; synthetic-email replacement bypasses the overwrite toggle.
- Batch writes (100 per transaction); commit-what-worked semantics on partial failure.
- Idempotency verified on staging test harness (run twice → second run shows 0 diffs).
- **Deliverable:** admin can retroactively fix historical Contact data. Dashboard list shows real names for past Productive Families visitors after one backfill click.

---

## Quality Disciplines

### Single-migration feature, single column

Unlike Phase / Step / FormField, there's no multi-pass dance. One column, nullable, no default. Existing rows get NULL and legacy fallback handles them. Single Prisma migration per stage (Stage 1 only — Stages 2 and 3 are code-only).

### Staging-first as always

Each stage migrates and ships to staging first, gets QA'd on the test event harness, then ships to production via the standard PR → squash-merge flow. Database snapshot before the Stage 1 production migration.

### Pre-flight audit was completed before this spec

Findings already incorporated:
- Name handling is inline in `route.ts:188, 419-442` — no service layer to refactor
- Synthetic email helper at `src/lib/contact/synthetic-email.ts` — preserved as-is
- `publicRegistrationSchema` is dead code — left untouched (optional separate cleanup)
- Email is the only column with quirks (lowercase + synthesis); others are raw pass-through
- Six default fields confirmed: `firstName`, `lastName`, `email`, `phone`, `organization`, `designation`

### Test event harness updates

Add two configurations to the existing staging test event:

1. A copy of Productive Families' form structure: fields named "First Name", "Middel Name", "Third Name". Tag First Name → FIRST_NAME, Middel Name + Third Name → LAST_NAME. Register a visitor; confirm Contact populates correctly.
2. A single FULL_NAME field. Submit "Mohamed Al-Saud". Confirm split.

After Stage 3 ships, run backfill on both. Confirm idempotency.

### Mockup before Stage 1 form-builder code

The form-builder page is ~1700 LOC and high-touch. Per project convention, produce a visual mockup of the new field-row control + summary card placement before writing builder UI code. Same discipline as CATEGORY_PHASES_SPEC.

### Stage 3 isolation

Backfill is the only mass-UPDATE operation in this feature. Isolating it as its own PR keeps review tight and lets Productive Families admins tag fields + verify new-registration behavior before risking the historical-data write. If Stage 2 ships clean, Stage 3 is purely upside.

### Concurrency

Backfill uses Prisma's interactive transaction for each 100-row batch. Within a batch, no row locks are needed — backfill updates `Contact` rows that are not the target of concurrent writes during the operation (admins are not editing the same event's contacts in another tab while clicking Backfill).

If a Contact has been edited between preview and run, the row-level update still goes through — last-write-wins. The `expectedWillUpdate` guard at the run endpoint protects against running a stale preview where the diff count has materially changed (caller refetches preview).

### Privacy and audit

- Backfill writes do NOT stamp `Contact.updatedBy` (added in Admin-Edit-Fix Stage 1). The system itself is the editor — surfacing "Updated by Mohanad" for every backfilled row would be misleading. If we add a "Backfill" audit type later, that's a v2 concern.
- Backfill operations log to console at INFO with event ID, admin user ID, row count, overwrite flag. No PII in logs.

### Bilingual

No bilingual rendering required. The "Maps to" dropdown and summary card are admin-facing. Role labels (First Name, Last Name, etc.) are English-only — these are config UI strings, not attendee-facing content.

---

## Acceptance Criteria

### Stage 1

- [ ] Mockup of field-row "Maps to" control + summary card approved before implementation.
- [ ] Schema migration adds `mapsTo` to `FormField` (nullable). Existing fields unaffected.
- [ ] `FieldMapping` enum has exactly 7 values: FIRST_NAME, LAST_NAME, FULL_NAME, EMAIL, PHONE, ORGANIZATION, DESIGNATION.
- [ ] PATCH form-field endpoint accepts and validates `mapsTo`.
- [ ] Single-value uniqueness enforced per event — second tag rejected with 409 + conflict details.
- [ ] FULL_NAME mutual exclusion enforced — rejected with clear error naming the conflicting field.
- [ ] Type compatibility enforced — incompatible roles hidden from dropdown and rejected server-side.
- [ ] Swap endpoint atomically reassigns a single-value tag.
- [ ] Form-builder shows summary card with current mapping per role + legacy-fallback hint when unmapped.
- [ ] No runtime change to registrations.

### Stage 2

- [ ] `resolveContactColumns()` helper handles all 7 roles correctly.
- [ ] LAST_NAME with multiple fields joins values in `FormField.order` order, separated by single space, skipping empty/null parts.
- [ ] FULL_NAME splits on first whitespace; head → firstName, rest → lastName.
- [ ] Legacy fallback fires when no field is tagged for a role.
- [ ] Literal `body.fullName` fallback preserved (final rung).
- [ ] Email lowercase + synthesis logic preserved at existing site.
- [ ] Productive Families test config on staging populates `firstName = <First Name value>`, `lastName = <Middel Name> <Third Name>` on new registrations.
- [ ] Untagged events register identically to today.

### Stage 3

- [ ] Preview endpoint computes will-update / already-correct / skipped counts correctly.
- [ ] Preview returns per-row diff list (capped at 500).
- [ ] Run endpoint verifies `expectedWillUpdate` matches before writing — rejects with 409 on mismatch.
- [ ] Overwrite-off skips columns with existing non-empty values.
- [ ] Overwrite-on replaces non-empty values.
- [ ] Synthetic emails are replaced by resolved real emails regardless of toggle.
- [ ] Empty resolved emails are skipped — no synthetic email generated retroactively.
- [ ] Idempotency: second run produces zero diffs.
- [ ] Partial failure surfaces row-level errors; successful rows stay committed.

### Whole-feature

- [ ] All 3 stages deployed and verified on staging.
- [ ] Productive Families dashboard list shows real names after admin tags fields and runs backfill.
- [ ] No existing event required manual admin action to keep working.
- [ ] Tag uniqueness, mutual exclusion, and type compatibility all enforced consistently across UI and API.
- [ ] Backfill is idempotent and produces commit-what-worked semantics on partial failure.

---

## Open Questions

These are minor and can be decided during implementation, but Claude Code should surface its choice in each PR description rather than silently picking.

1. **Service file location.** Should `resolveContactColumns()` live in a new `src/lib/services/field-mapping.service.ts`, or be inlined into the route handler? Default: new service file. Pre-flight audit confirmed registration logic is currently inline, but a service makes the resolver reusable by backfill and testable in isolation.

2. **Type-compatibility list scope.** Should ORGANIZATION/DESIGNATION roles allow `SELECT`/`RADIO` fields, or restrict to `TEXT` only? Default: allow SELECT/RADIO. Some events use a fixed dropdown for organization (e.g. company picker). No downside since the value is still a string.

3. **Backfill diff preview cap.** 500 diffs feels right for Productive Families scale (~200 visitors max). What if a 5000-row event runs backfill? Default: cap at 500 with "and N more (apply to see)" hint. The summary counts (willUpdate/alreadyCorrect/skipped) are uncapped.

4. **Swap affordance scope.** Should Swap appear only for single-value role conflicts, or also when an admin tries to add FIRST_NAME/LAST_NAME while FULL_NAME exists? Default: yes, both. The Swap action in the FULL_NAME case unsets FULL_NAME entirely (since it's the conflicting single tag), not just one of multiple LAST_NAME tags.

5. **Backfill role of synthetic-email replacement.** Should the synthetic-email-replacement rule (always replace regardless of toggle) be surfaced in the preview UI as a separate count? Default: no, fold into willUpdate. The toggle copy mentions it once; double-surfacing adds noise.

---

## Notes for Claude Code

- This spec replaces no earlier spec. It's net-new.
- Three separate stages, three separate PRs.
- Stage 1 is the only stage with a schema migration. Stages 2 and 3 are code-only.
- The pre-flight audit (already complete) found that `publicRegistrationSchema` is dead code at `src/lib/validations/registration.ts`. Do not touch it as part of this feature — it's an optional separate cleanup.
- Reuse the resolver between the register endpoint and the backfill endpoint. One source of truth for the resolution logic.
- Email lowercase + synthesis lives downstream of the resolver. Do not move it. Mapping changes the input to those steps, not the steps themselves.
- The fullName fallback block at `route.ts:419-442` is removed in Stage 2. Its behavior is absorbed into the resolver's final rung (`if no tags and body.fullName exists → split`).
- Reuse the reorder-swap pattern from `phase.service.ts` for the swap-mapping endpoint.
- All admin routes use `authorizeEvent`. Backfill requires MANAGER (not EDITOR) due to destructive write scope.
- Stage 1 mockup needs human approval before form-builder UI code changes. Do not start the builder UI code without it.
- Honor existing patterns: services in `src/lib/services/`, Zod schemas in `src/lib/validations/`, `requireModule` is not needed (no module flag).
- One commit per logical chunk per stage. Push each stage as its own PR.

---

*Approved for implementation, stage by stage, with staging verification between stages.*
