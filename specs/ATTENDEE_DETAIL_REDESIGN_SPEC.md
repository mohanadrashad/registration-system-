# Attendee Detail Page Redesign — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation. Single-stage refactor — no new features, no schema changes.
**Prerequisites:** None. Independent of all in-flight feature work.

---

## Overview

The attendee detail page (`src/app/(dashboard)/dashboard/events/[eventId]/attendees/[contactId]/page.tsx`, ~1014 LOC) has accumulated cards over time. Today it stacks nine cards vertically with no visual grouping, and **per-phase information is split across three separate cards** (Phase Submissions, Selections, Phase Access). To understand one attendee's state on one phase, the admin scrolls between three locations on the page.

This spec replaces that layout with a three-column structure where each phase is a single unified card containing submission, selection, receipt, and access in one place. It is a pure UI refactor — no new functionality, no schema changes, no API changes.

This redesign is also a prerequisite for the upcoming category-based phase logic feature. That feature will add per-category rule information to surface on this page, and the current layout cannot absorb it cleanly.

---

## Goals

- Replace the nine-card vertical stack with a three-column layout that groups related information.
- Consolidate per-phase information (submission + selection + receipt + access override) into a single card per phase.
- Surface the attendee's category as a first-class header element instead of burying it in the Admin card.
- Separate registration form answers from system identity fields into distinct cards.
- Preserve every existing piece of functionality. No actions removed, no data hidden.

## Non-Goals

- Adding any new functionality beyond what exists today.
- Changing any API, service, or schema.
- Adding WhatsApp history surfacing (deferred until the per-event WhatsApp module work).
- Implementing per-category phase visibility (that belongs to the next feature).
- Adding bulk actions or multi-attendee operations.
- Translating the page to Arabic (admin UI remains English-only per project conventions).

---

## The Redesigned Layout

### Header (full width)

- Back button
- Avatar circle with initials
- Attendee name (heading) + email (secondary)
- Registration status badge (Registered / Pending / Cancelled / Waitlisted)
- **Category pill** (new placement — surfaced from the Admin card)
- Edit button

### Three columns below the header

Grid: `minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 0.9fr)` with `gap: 14px`. Middle column is widest because it carries the per-phase cards.

### Left column — Identity

Four stacked cards, each compact and read-mostly:

**Identity card** — system fields only: first name, last name, email, phone, nationality, ID number, company. The stable identity of the person.

**Registration answers card** — every `FormField` answer from the REGISTRATION phase that is *not* a system identity field. Dietary preferences, t-shirt size, arrival mode, dynamic fields the admin added. Pulled from `Registration.formData`. Rendered as label → value pairs.

**Admin & registration card** — category (badge), source (bulk import / manual / self-registered), added date, registration status, registered-at timestamp, confirmation code (monospace, truncated with copy-on-click).

**Registration link card** — the personal registration token URL with a copy button. Same as today.

### Middle column — Per-phase view

The main change. One card per phase that applies to this attendee, sorted by `Phase.order`.

**Phase card structure:**

- **Phase header row:**
  - Phase icon (admin-chosen or default by phase type)
  - Phase title
  - Completion badge: `Complete` / `Partial` / `Receipt missing` / `Not started` / `Pending assignment` / `Closed` — computed from existing phase status logic
  - Open/close window (`Opens May 1 · Closes May 15`) — right-aligned, muted

- **Four content rows below the header, each separated by a thin border:**

  1. **Submission row** — "Submitted May 5 · 4:04 PM" or "Not submitted". Right side: View / Edit button that opens the existing submission editor.

  2. **Selection row** — "Marriott Riyadh" + source badge (Admin assigned / Attendee picked). Right side: Change button. If the phase has `selectionMode = NONE`, this row is omitted entirely (see "Conditional rows" below).

  3. **Receipt row** — filename if uploaded, with a View button that calls the existing signed-URL endpoint. Or "Required · not uploaded" in warning color with an Upload button. Or "Not required" muted. If the phase has no options requiring a receipt, this row is omitted.

  4. **Access row** — "Default (date-based)" or `Force open` / `Force lock` badge with the override reason and admin name inline. Right side: Force open / Force lock buttons (when no override) or Reset button (when overridden).

**Conditional rows:** the Selection and Receipt rows only render when relevant. Phases with `selectionMode = NONE` skip the Selection and Receipt rows entirely. Phases with options but no receipt requirement skip the Receipt row. The Submission row appears for every phase. The Access row appears for every POST_REGISTRATION phase.

**Empty state:** if the event has no phases configured, the middle column shows a small empty-state message: "No phases configured for this event."

**Top-of-column summary:** above the first phase card, a thin label row reads `Phases for this attendee` (left) and `N of M complete` (right, muted, computed live).

### Right column — Communications & Output

Three stacked cards:

**E-Badge card** — small QR thumbnail (or "Not yet generated" placeholder), then a row of two buttons: View badge, Email badge. Behavior unchanged from today's E-Badge card.

**Email history card** — list of `EmailLog` rows scoped to this contact. Each row: subject (bold) + timestamp (muted) + status pill (Sent / Delivered / Opened / Bounced / Failed). Same data source as today, just compact layout. Capped at 5 most recent with a "View all" link if more exist (link can be deferred — see Open Questions).

**Quick actions card** — buttons for actions that already exist elsewhere in the codebase. **Claude Code must audit which actions exist before implementing this card.** Candidates: resend confirmation email, regenerate badge, cancel registration. Each button must map to an existing service method or API route. If a candidate action does not exist today, it is dropped from the card — do not implement new functionality as part of this refactor.

---

## What Changes From Today (Before / After)

| Today | After |
|---|---|
| 9 cards stacked vertically | 3 columns: Identity (left), Phases (middle), Communications (right) |
| Attendee Information card mixes system fields and form answers | Identity card (system fields) + Registration answers card (form data) |
| Category buried in Admin card | Category pill in the header, next to status badge |
| Phase Submissions card lists submissions across phases | One card per phase; submission is one row inside it |
| Selections card lists selections across phases | Selection is one row inside the per-phase card |
| Phase Access card lists overrides across phases | Access is one row inside the per-phase card |
| To understand one phase's state, scroll between 3 sections | All four rows of one phase visible in one card |
| No quick-action shortcuts | Quick actions card (only for actions already available elsewhere) |

---

## What Must Be Preserved

This is a pure refactor. Every existing capability must keep working:

- All system field display (name, email, phone, nationality, ID, company, etc.)
- All registration form answer display (whatever fields the event has configured)
- Category display + edit dialog
- Source, added date, registration status, confirmation code, registered-at
- Registration link with copy button
- All phase submission view/edit flows
- All selection change flows including the over-capacity confirm dialog
- Receipt view via signed-URL endpoint
- Phase access override controls (Default / Force open / Force lock with reason)
- E-Badge view / email actions
- Email history list with full pagination behavior

If a feature works on the page today, it must work on the redesigned page. Functional regressions block the PR.

---

## Implementation Plan

Single stage. This is a refactor, not a feature, so it ships as one focused PR.

### Stage 0 — Pre-flight audit

Before any code changes, Claude Code runs a small audit and reports back:

1. **Quick actions audit** — for each candidate action (resend confirmation email, regenerate badge, cancel registration), find whether it exists today in any service method, API route, or other page. Report which exist with file paths.

2. **Registration form answer extraction** — confirm the current code path that reads `Registration.formData` and renders each answer with its `FormField` label. The redesign reuses this logic; just needs to be lifted into the new Registration answers card.

3. **Per-phase data shape** — confirm what data the current page already fetches per phase (submission row, selection row, access override row, receipt). The redesign uses the same data; just regroups it into one card per phase.

Audit output goes in the PR description so reviewers can confirm scope before implementation.

### Stage 1 — Implementation

- Rewrite the page layout from nine-card vertical to three-column grid as specified.
- Lift system fields into the Identity card; lift form answers into the Registration answers card.
- Build the per-phase card component (likely a small new client component in `src/components/attendee/` or similar). It renders the four rows conditionally based on phase config.
- Move the category pill into the header next to the status badge.
- Build the Quick actions card using only the actions confirmed in Stage 0's audit.
- Preserve all existing dialogs, mutation calls, and refresh patterns. The redesign changes layout; it does not change logic.
- Verify the page handles all edge cases that exist today: empty form data, phases with no options, phases not yet opened, attendees with no phase activity, etc.

### Stage 2 — Manual QA on Preview

Run through the test event harness:

- Open the detail page for an attendee with no phase activity → middle column shows empty phase cards (Not started for each).
- Open for an attendee mid-flow on a Phase Selections phase → selection visible, receipt missing warning shows.
- Open for an attendee with a force-open access override → override badge with reason and admin name visible inline.
- Open for an attendee with multiple submitted phases → all show Complete with correct timestamps.
- Edit a submission → existing editor opens, save → page refreshes with updated state.
- Change a selection past capacity → existing over-capacity confirm dialog still fires.
- View a receipt → existing signed-URL flow still works.
- Toggle access override → state writes correctly, reason captured.
- Use a Quick action (whichever ones survived the audit) → confirm they still do what they did before.

### Stage 3 — Commit, push, verify, merge

Follow the end-of-stage workflow in CLAUDE.md:

1. Commit with `refactor(attendee-detail): three-column layout with per-phase cards`
2. Push to a feature branch (suggested: `attendee-detail-redesign`)
3. Verify Vercel Preview build green
4. Report status to user
5. After user green-light: PR → squash-merge → delete branch → verify production deploy

---

## Quality Disciplines

### Mockup-driven

The approved mockup from the planning session is the source of truth for the layout. Claude Code does not improvise the layout, does not rearrange columns, does not add cards not in the mockup. Deviations require user sign-off before committing.

### No scope creep

This refactor adds zero features. If during implementation Claude Code identifies an opportunity to add functionality (e.g., "while we're here, we could also let admins bulk-edit phase access"), it surfaces the idea to the user and does not implement it as part of this PR.

### Preserve every existing feature

The acceptance criteria explicitly require that every capability working today still works. Functional regressions are the primary risk of a refactor of this size on a ~1014-LOC page. Test against the harness exhaustively.

### Component extraction is welcome

The current page is a single 1014-LOC file. The redesign is a natural moment to extract sub-components: the per-phase card is a clear candidate, as is the Quick actions card. Extracted components live in `src/components/attendee/` (or similar — Claude Code picks a sensible location). Smaller files, easier to maintain, no behavior change.

### English-only

Admin UI remains English-only. Bilingual is a portal concern, not in scope here.

---

## Acceptance Criteria

- [ ] Pre-flight audit completed and reported (Stage 0).
- [ ] Header includes Back, avatar, name, email, status badge, category pill, Edit button.
- [ ] Left column shows four cards: Identity, Registration answers, Admin & registration, Registration link.
- [ ] Middle column shows one card per phase with conditional Submission / Selection / Receipt / Access rows as specified.
- [ ] Right column shows three cards: E-Badge, Email history, Quick actions.
- [ ] Quick actions card contains only actions confirmed to exist by the Stage 0 audit.
- [ ] Category appears in the header pill, not in the body.
- [ ] Registration answers are in their own card, separated from system identity fields.
- [ ] All existing dialogs (edit submission, change selection, over-capacity confirm, override reason, receipt view) open and complete successfully.
- [ ] All existing API calls fire correctly. No new endpoints introduced.
- [ ] No new schema, no migration, no new services.
- [ ] Page handles edge cases: zero phases, zero submissions, zero selections, zero email history, badge not yet generated.
- [ ] Vercel Preview build green.
- [ ] Test event harness end-to-end QA passed.
- [ ] No functional regression vs. the current page.

---

## Open Questions

These are minor and can be decided during implementation, but Claude Code should surface its choice in the PR description rather than silently picking.

1. **QR thumbnail in E-Badge card** — render a small QR image preview, or just a "Ready" status text + View button? Default: status text only (avoids a second QR render path for the same data).

2. **Email history cap** — show all rows, or cap at 5 with a "View all" link? Default: show all, no cap. Most attendees have under 10 emails. Pagination is over-engineering for v1.

3. **Per-phase card icon** — phases don't carry an icon field in the schema today. Default: use a generic `ti-clipboard-list` icon for every phase. Adding a per-phase icon is a separate feature.

4. **Category pill color** — today categories are free-text strings with no color metadata. Default: render every category pill in neutral gray. Color-coded categories belong to the next feature.

5. **Empty phase row** — when a phase has options but the attendee has not picked yet, should the Selection row show "Not selected" or be omitted? Default: show "Not selected" — admin needs to know the phase has an unfilled selection slot.

---

## Notes for Claude Code

- The approved layout mockup is in the chat history that produced this spec. The structure above is authoritative. If something in the spec is unclear, ask in the PR description rather than improvising.
- Do not add features. If you find something missing during implementation (e.g., "the Quick actions card looks empty because none of the candidate actions exist today"), surface it and let the user decide whether to add scope or ship the smaller version.
- Reuse existing services and API routes. There should be zero new database queries unique to this page.
- Extract sub-components where natural — per-phase card, quick actions card, email history list. Keep the main page file lean.
- Run `npx prisma generate` is not needed — no schema changes.
- Do not add tests unless explicitly asked (per CLAUDE.md).
- Honor existing patterns: services in `src/lib/services/`, Zod schemas in `src/lib/validations/`, `requireModule` guards already in place where needed.
- After implementation, run the full QA flow described in Stage 2 against the staging test event. The page handles many edge cases; verify them all.
- Single commit per logical chunk: one for the audit results in the PR description, one for the layout rewrite, one for any extracted components. Keep history readable.
- This is a refactor, not a feature. The success metric is "the page does exactly what it did before, but better organized."

---

*Approved for implementation. Single stage, single PR. Ships before the category-based phase logic feature.*