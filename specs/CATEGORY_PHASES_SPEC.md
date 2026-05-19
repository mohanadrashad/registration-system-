# Category-Based Phase Logic — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation in 3 sequential stages. Builds on the Phase / Step / FormField system, Phase Selections, and the attendee detail redesign.
**Prerequisites:** All previous features (Phase-Based Forms, Phase Selections, Attendee Detail Redesign) are deployed and stable in production.

---

## Overview

The platform supports post-registration phases, but every attendee on an event sees the same set of phases. Real events have different attendee types — VIP, Media, Visitor — and each type goes through a different journey. VIPs get pre-assigned hotels with no receipt required. Media handle accreditation. Visitors fill dietary preferences. Currently the admin has no way to express "this phase is for VIPs only."

This spec adds **per-category phase visibility**: each phase declares which categories it applies to. Empty = applies to everyone (current behavior preserved). Non-empty = only attendees in those categories see it.

It also hardens `Contact.category` as a constrained value (today it's free-text with no enforcement), and adds receipt labels with instructions so attendees know what they're uploading.

The three pieces are independent in concept but ship together because they all serve the same upcoming real-event need: differentiated attendee journeys with clear receipt requirements.

---

## Goals

- An admin can assign one or more categories to a phase. Attendees see only the phases that apply to their category.
- Uncategorized attendees see only universal phases (those with no category filter).
- The `Contact.category` field is constrained to values defined in `Event.categories`. Free-text entry is no longer possible from any code path.
- Each `PhaseOption` that requires a receipt can carry a label and short instructions, shown above the upload control on the portal.
- All existing phases continue working unchanged — adding the field with an empty default means current behavior is preserved.

## Non-Goals

- Multiple categories per attendee. `Contact.category` remains a single nullable string.
- Conditional category logic ("if attendee picked option X, change their category"). Out of scope.
- Per-category phase rules within a single phase (e.g., "Hotel phase is admin-assigned for VIPs but attendee-picks for Regular"). The simpler model — separate phases per category — handles this case without new schema.
- Color-coded categories in the UI. Categories stay neutral-gray pills until a future visual project addresses this.
- Translating category names to Arabic. Categories are admin-facing strings; the portal shows them when relevant but doesn't translate.
- Bulk re-categorization of existing attendees. Each attendee's category is set manually or via CSV at import time.

---

## Architecture

Two model changes. No new tables.

**`Phase`** gets `appliesToCategories: String[]` (default `[]`). Empty array = visible to everyone. Non-empty array = visible only to attendees whose `Contact.category` is in the array.

**`PhaseOption`** gets `receiptLabel: String?` and `receiptInstructions: String?` (both nullable). Shown on the upload screen only when the option requires a receipt.

`Contact.category` keeps its existing shape — `String?` — but gains application-layer enforcement: any write must be `null` or a value in the parent `Event.categories` list.

---

## Schema Changes

### `Phase` model — additions

```prisma
model Phase {
  // ... existing fields preserved ...

  appliesToCategories String[] @default([])
}
```

Empty array means "applies to all attendees." Non-empty array means "only attendees in these categories." Defaults preserve current behavior for every existing phase.

### `PhaseOption` model — additions

```prisma
model PhaseOption {
  // ... existing fields preserved ...

  receiptLabel        String?
  receiptInstructions String? @db.Text

  receiptLabelAr        String?
  receiptInstructionsAr String? @db.Text
}
```

Bilingual fields follow the existing pattern (`labelAr`, `descriptionAr`). The portal renders Arabic when the `multiLanguage` module is on.

### Migration mechanism

**This repo has no Prisma migration history** — it ships schema changes via `prisma db push` and applies data changes through committed, idempotent one-off scripts in `prisma/scripts/` run with `tsx` (e.g. `migrate-to-phase-step-model.ts`, `add-modules-to-existing-events.ts`). There is no `prisma/migrations/` directory and `prisma migrate` has never been run. The "single Prisma migration" framing in earlier drafts of this spec was incorrect; this section is the correction.

Per stage, therefore:

- **Schema changes** (Stage 2's `Phase.appliesToCategories`, Stage 3's `PhaseOption` receipt fields): applied via `prisma db push` against staging, then production, after a DB snapshot. The new columns have safe defaults, so existing rows are unaffected.
- **Data changes** (Stage 1's empty-string normalization): a committed, idempotent script in `prisma/scripts/`, not an embedded migration SQL.

Stage 1 has **no schema change** — only the data normalization. It ships as `prisma/scripts/normalize-empty-category.ts`:

```ts
// idempotent: UPDATE "Contact" SET category = NULL WHERE category = '';
// logs affected row count; reads DATABASE_URL from env (staging or prod)
```

Run on staging first, verify the count, snapshot production, then run against production with the Vercel production `DATABASE_URL`. Production audit confirmed exactly one row matches this condition (test data); the script is safe to re-run (second pass affects zero rows).

---

## Behavior Specifications

### Category enforcement

Two layers:

**Application layer (Zod):** Every endpoint that writes `Contact.category` validates that the value is either `null`, an empty string (which is coerced to `null`), or one of the strings in the parent event's `Event.categories` list. Endpoints affected:

- `POST /api/events/[eventId]/contacts` (create)
- `PUT /api/events/[eventId]/contacts/[contactId]` (update)
- `POST /api/events/[eventId]/contacts/import` (CSV import)

Invalid categories are rejected with a clear error: `"Category 'vip' is not in this event's categories list [VIP, Regular, Media]."` For CSV import, the error is row-scoped: `"Row 12: category 'vip' not in event categories."` The whole import fails if any row is invalid — partial imports are worse than no import.

**UI layer:** Every category input becomes a dropdown that lists `Event.categories` plus a "None" option. The dropdown is the only way to set category from the UI. No free-text fallback. If the event has no categories defined, the dropdown is disabled with a hint: "Define categories in event settings first."

### Phase visibility logic

When the portal lists phases for an attendee, the filter is:

```
visible = phase.appliesToCategories.length === 0  // everyone-phase
       || phase.appliesToCategories.includes(contact.category)  // category match
```

If `contact.category` is `null`, only `appliesToCategories.length === 0` phases pass. Uncategorized attendees see only universal phases.

This filter applies in three places:

- Portal phase list (`/portal/[eventSlug]`)
- Portal phase fill page (`/portal/[eventSlug]/phases/[phaseId]` — returns 404 if the phase doesn't apply to this attendee)
- Admin attendee detail page (middle column shows only phases that apply to this attendee's category)

The admin form-builder shows **all** phases regardless of category — admins always see the full picture. Category filtering is for attendee-facing views only.

### Receipt labels and instructions

When `PhaseOption.requiresReceipt = true` and the attendee reaches the upload step:

- Above the file picker, render the `receiptLabel` (bold, ~14px) and `receiptInstructions` (muted, smaller).
- Example: **"Flight ticket"** / *"Upload a PDF or photo of your flight confirmation showing arrival date in Riyadh."*
- If both fields are null, the upload control renders as it does today — no extra UI.
- Bilingual: render `receiptLabelAr` / `receiptInstructionsAr` when the `multiLanguage` module is on.

In the admin options panel, both fields appear in the option editor under the existing `requiresReceipt` toggle. They're only relevant when receipt is required, so they collapse when the toggle is off.

### Admin form-builder UI

Each phase in the form-builder gets a new control: **"Applies to"** with a multi-select dropdown of `Event.categories`. Empty selection = "All categories" (the default — preserves current behavior). One or more selected = phase is restricted to those categories.

The phase header in the form-builder shows a small pill summarizing the rule:
- `All categories` when empty (neutral gray)
- `VIP, Media` when restricted (lists the categories)

Click the pill to open the multi-select. Standard reorder/save behavior unchanged.

### Admin attendee detail page

The middle column (per-phase cards) filters phases by the attendee's category. A phase that doesn't apply is hidden — not grayed out. If an attendee is uncategorized and the event has only category-restricted phases, the middle column shows the empty state ("No phases apply to this attendee — they may need a category assigned").

Above the phase list, the existing "Phases for this attendee" header gains a small hint: `Showing N of M phases (filtered by category: VIP)`. Empty events show no hint.

---

## Implementation Stages

Each stage is mergeable on its own. Verify on staging before the next.

### Stage 1 — Category hardening

Lock down `Contact.category` as a constrained value. No new behavior visible to end users — this is plumbing.

- One-line SQL: `UPDATE "Contact" SET category = NULL WHERE category = ''`.
- Add Zod validation to the contact create, update, and CSV import endpoints. Validation reads `Event.categories` and rejects values not in the list (with `null` and empty-string allowed, both coerced to `null`).
- Update `getCategories()` in `contact.service.ts` to read from `Event.categories` (the canonical source), not from existing Contact rows.
- Update the admin attendee detail page's category dropdown to remove the free-text fallback. Disable the field with a hint when the event has no categories defined.
- Update CSV import to surface row-scoped errors when a row's category isn't valid.
- **Deliverable:** category becomes a constrained value across every code path. No new UI features. Existing categorized attendees (currently zero) are unaffected. Tested with a sample CSV that contains both valid and invalid category rows.

### Stage 2 — Per-category phases

Add `appliesToCategories` to `Phase`. Build the admin UI to set it. Apply the filter on attendee-facing views.

**Schema + API:**
- Single Prisma migration adding `appliesToCategories String[] @default([])` to `Phase`.
- Update phase create/update endpoints (`PATCH /api/events/[eventId]/phases/[phaseId]`) to accept the new field.
- Add Zod validation: every value in the array must be in `Event.categories`.

**Admin UI:**
- Form-builder: add the "Applies to" multi-select to each phase's settings card.
- Phase header shows the summary pill (`All categories` or comma-list).

**Portal:**
- `GET /api/portal/[eventSlug]/phases` filters by `appliesToCategories` and the attendee's category.
- `GET /api/portal/[eventSlug]/phases/[phaseId]` returns 404 if the phase doesn't apply.

**Attendee detail page:**
- Middle column filters phases by the attendee's category.
- Header hint shows "Showing N of M phases (filtered by category: …)" when filtering is active.
- Empty state when no phases apply.

**Deliverable:** end-to-end per-category phases working. Pre-existing phases keep `appliesToCategories = []` so they continue showing to everyone. New phases can be category-restricted.

### Stage 3 — Receipt labels and instructions

Small additive feature. No conditional rendering complexity — labels show when present, don't show when absent.

- Single Prisma migration adding `receiptLabel`, `receiptInstructions`, `receiptLabelAr`, `receiptInstructionsAr` to `PhaseOption`.
- Update option create/update endpoints to accept the new fields.
- Admin options panel: text inputs for label + instructions, collapsed when `requiresReceipt = false`. Bilingual fields when `multiLanguage` module is on.
- Portal upload screen: render label (bold) and instructions (muted) above the file picker when present.
- **Deliverable:** admins can write per-option receipt context. Attendees see clear instructions on what to upload.

---

## Quality Disciplines

### Single-migration feature

Unlike the Phase / Step / FormField rollout, this feature doesn't need a multi-pass migration. The new columns have safe defaults, so existing rows are unaffected. Single Prisma migration per stage.

### Staging-first as always

Each stage migrates to staging first, gets verified on the test event harness, then ships to production via the standard PR → squash-merge flow. Database snapshot before each production migration.

### Mockup before code for the form-builder change

Stage 2 touches the form-builder page (~1700 LOC). Per the project rule, that needs a visual mockup approved before implementation. Mockup the "Applies to" multi-select placement and the phase-header pill before Claude Code writes any builder code.

### Pre-flight audit pattern

Stage 1's CSV import enforcement and Stage 2's portal filtering both make assumptions about how the current code behaves. Before each stage, Claude Code runs a small audit: "show me the current code path for X" and reports back before implementing. Same pattern that saved the redesign from shipping a Quick actions card with non-existent buttons.

### Test event harness

The existing staging test event already has VIP and Regular-style categories defined. Extend it for this feature:

- One phase set to `appliesToCategories: ["VIP"]` (visible to VIPs only)
- One phase set to `appliesToCategories: ["Regular"]` (visible to regulars only)
- One phase with `appliesToCategories: []` (visible to everyone — preserves current behavior)
- One PhaseOption with a receipt label + instructions, one with neither (validates the conditional render)

After each stage, walk through the full flow as both a VIP attendee and a Regular attendee. Confirm each sees the right phases. Confirm the receipt instructions render correctly when present and gracefully when absent.

### Bilingual

The portal already renders Arabic when `multiLanguage` is on. Stage 3's receipt label/instructions follow the same pattern. Stage 2's category names are admin-defined strings — they render as-is, regardless of locale. No translation logic needed.

### No new infrastructure

This feature ships without new services, queues, crons, or third-party dependencies. All work is schema + API + UI.

---

## Acceptance Criteria

### Stage 1

- [ ] The one production row with `category = ''` is normalized to `NULL`.
- [ ] Creating a contact via API with an invalid category is rejected with a clear error.
- [ ] Updating a contact via API with an invalid category is rejected with a clear error.
- [ ] CSV import rejects rows with invalid categories. Error message names the row and the invalid value.
- [ ] Admin attendee detail page category field is a dropdown only — no free-text input anywhere.
- [ ] Dropdown is disabled with a hint when the event has no categories defined.
- [ ] `getCategories()` reads from `Event.categories`, not from existing Contact rows.

### Stage 2

- [ ] Visual mockup of the form-builder phase-settings card change approved before implementation.
- [ ] Schema migration adds `appliesToCategories` with `default([])`. Existing phases unaffected.
- [ ] Phase create/update endpoints accept and validate `appliesToCategories` (every value must be in `Event.categories`).
- [ ] Form-builder shows the "Applies to" multi-select on each phase.
- [ ] Phase header pill summarizes the rule (`All categories` or comma-list).
- [ ] Portal phase list filters by the attendee's category.
- [ ] Portal phase fill page returns 404 for phases that don't apply.
- [ ] Attendee detail page middle column filters by the attendee's category.
- [ ] Attendee detail page shows the filtering hint ("Showing N of M phases").
- [ ] Uncategorized attendees see only universal phases.
- [ ] Test event harness updated and end-to-end QA passed for both VIP and Regular attendee flows.

### Stage 3

- [ ] Schema migration adds `receiptLabel`, `receiptInstructions`, `receiptLabelAr`, `receiptInstructionsAr` to `PhaseOption`.
- [ ] Admin options panel shows the new fields, collapsed when `requiresReceipt = false`.
- [ ] Bilingual fields appear when `multiLanguage` module is on.
- [ ] Portal upload screen renders label and instructions when present.
- [ ] Upload screen renders unchanged (no extra UI) when both fields are null.

### Whole-feature

- [ ] All 3 stages deployed and verified on staging.
- [ ] No existing event required manual admin action to keep working.
- [ ] Per-attendee, per-category phase visibility behaves as specified across portal and admin views.
- [ ] Bilingual rendering correct.
- [ ] `Contact.category` enforcement holds across every write path.

---

## Open Questions

These are minor and can be decided during implementation, but Claude Code should surface its choice in each PR description rather than silently picking.

1. **Category dropdown sorting.** Should the dropdown list categories alphabetically, or in the order defined in `Event.categories`? Default: order defined. The admin chose that order for a reason.

2. **Filtering hint visibility.** Should "Showing N of M phases" always appear, or only when filtering is actually reducing the count? Default: only when reducing — keeps the page quieter for uncategorized attendees on universal-only events.

3. **CSV import — partial failure mode.** If row 12 has an invalid category, should rows 1-11 still import (with row 12 rejected), or should the whole file fail? Default: whole file fails. Partial imports create confusing state ("did row 12 get added or not?") and require admins to dedupe after re-uploading.

4. **Receipt instructions length cap.** No cap today. Should there be one to prevent admins from writing a paragraph? Default: no cap. Trust the admin; the UI uses `whitespace-pre-wrap` so line breaks work.

5. **What happens to existing PhaseAccess overrides on category-restricted phases.** If a phase is restricted to `["VIP"]` and an admin has a `PhaseAccess.OPEN` override for a Regular-category attendee — does the override still apply? Default: yes. `PhaseAccess` overrides existed for exactly this case (admin granting exceptional access). The override wins over the category filter.

---

## Notes for Claude Code

- This spec replaces no earlier spec. It's net-new.
- Three separate stages, three separate PRs.
- Run the existing migration safety pattern: snapshot before each production migration, verify on staging first, roll forward only after staging is clean.
- Stage 1's CSV import enforcement is the trickiest part of Stage 1 — surface the exact error format in the PR description so I can confirm it's clear before merge.
- Stage 2's mockup needs human approval before the form-builder code changes. Do not start the builder UI code without it.
- Stage 3 is the simplest stage. If anything in the spec feels ambiguous there, default to "render when present, render nothing when absent."
- Honor existing patterns: services in `src/lib/services/`, Zod schemas in `src/lib/validations/`, `requireModule` guards on gated routes.
- Do not modify the existing `Phase`, `PhaseOption`, or `Contact` shape beyond what's specified.
- Do not add tests unless explicitly asked.
- One commit per logical chunk per stage. Push each stage as its own PR.

---

*Approved for implementation, stage by stage, with staging verification between stages.*
