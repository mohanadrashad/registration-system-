# Phase-Based Forms Platform — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation in 6 sequential stages. Each stage is a separate mergeable chunk.

---

## Overview

The registration platform currently uses a single flat list of `FormField` rows per event to render the registration form. This is too rigid for real events, which need two things:

1. **Multi-step registration.** Long registration forms should span multiple pages, with Next/Back navigation, per-step validation, and draft saving.
2. **Post-registration data collection.** After attendees register, organizers often need to collect additional data on a schedule — flight details two weeks out, hotel preferences one week out, dietary preferences three days out — each with its own open/close dates and reminder emails.

Both features share the same underlying concept: a group of fields rendered as one or more pages at a defined moment in time. This spec introduces a three-layer model — **Phase → Step → FormField** — that cleanly expresses both use cases without duplicating UI or schema.

---

## Goals

- An event admin can split registration into multiple pages.
- An event admin can define additional data-collection phases that open after registration.
- A phase can itself contain multiple pages (steps), reusing the same stepper UX.
- Attendees register via a stepper that validates per-step, preserves drafts, and supports deep-linking.
- Attendees access post-registration phases through the self-service portal with clear open/closed/completed states.
- Admins can override phase access per attendee (unlock early or lock out) for legitimate business reasons.
- Reminder emails fire automatically when a phase opens, without introducing new infrastructure.
- Existing single-page events continue working with zero manual admin action.
- Both English and Arabic UI render correctly, including RTL.

## Non-Goals

- Server-side draft persistence for in-progress registration (use localStorage for v1).
- Skip-logic that jumps between non-adjacent steps.
- Payment gating between steps or phases.
- Cross-phase conditionals (showing a phase based on answers given in another phase).
- True background cron infrastructure (we use lightweight on-demand triggers — see Stage 6).

---

## Architecture: Phase → Step → FormField

Three layers, each doing one job:

```
    Event
      │
      ▼
   ┌──────────────────────────────────────────┐
   │  Phase  — WHEN data is collected         │
   │  • type: REGISTRATION | POST_REGISTRATION│
   │  • opensAt, closesAt (POST_REG only)     │
   │  • order                                 │
   └──────────────────────────────────────────┘
              │
              │  has many
              ▼
   ┌──────────────────────────────────────────┐
   │  Step   — HOW it's paginated (Next/Back) │
   │  • title, titleAr                        │
   │  • order                                 │
   └──────────────────────────────────────────┘
              │
              │  has many
              ▼
   ┌──────────────────────────────────────────┐
   │  FormField  — WHAT is being asked        │
   │  • label, type, validation, conditional  │
   └──────────────────────────────────────────┘
```

**Key properties:**

- Registration is just a phase with `type = REGISTRATION`. It always exists, is always open, has no dates, and is created automatically on event creation.
- Post-registration phases are rows with `type = POST_REGISTRATION`, each with its own open/close window.
- A phase always has at least one step. Single-page phases have exactly one step; multi-page phases have several.
- Fields belong to steps, not directly to phases. The registration renderer, portal renderer, and admin builder all operate on step-level field lists — the same renderer code works in both contexts.

---

## Schema

### New Models

```prisma
model Phase {
  id            String    @id @default(cuid())
  eventId       String
  type          PhaseType

  title         String
  titleAr       String?
  description   String?   @db.Text
  descriptionAr String?   @db.Text

  order         Int       @default(0)
  isActive      Boolean   @default(true)

  // POST_REGISTRATION only (NULL for REGISTRATION type)
  opensAt       DateTime?
  closesAt      DateTime?
  isRequired    Boolean   @default(false)
  reminderSent  Boolean   @default(false)
  reminderTemplateId String? // FK to EmailTemplate; NULL = use default

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  event         Event              @relation(fields: [eventId], references: [id], onDelete: Cascade)
  steps         Step[]
  submissions   PhaseSubmission[]
  accessOverrides PhaseAccess[]
  reminderTemplate EmailTemplate? @relation(fields: [reminderTemplateId], references: [id])

  @@unique([eventId, order])
  @@index([eventId, type])
}

enum PhaseType {
  REGISTRATION
  POST_REGISTRATION
}

model Step {
  id            String     @id @default(cuid())
  phaseId       String

  title         String
  titleAr       String?
  description   String?    @db.Text
  descriptionAr String?    @db.Text

  order         Int        @default(0)

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  phase         Phase      @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  fields        FormField[]

  @@unique([phaseId, order])
  @@index([phaseId])
}

model PhaseSubmission {
  id             String       @id @default(cuid())
  phaseId        String
  registrationId String

  data           Json
  submittedAt    DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  phase          Phase        @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  registration   Registration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  @@unique([phaseId, registrationId])
  @@index([registrationId])
  @@index([phaseId])
}

model PhaseAccess {
  id             String       @id @default(cuid())
  phaseId        String
  registrationId String

  status         AccessStatus
  unlockedAt     DateTime?
  unlockedBy     String?      // User.id of admin
  reason         String?      // Optional note

  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  phase          Phase        @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  registration   Registration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  @@unique([phaseId, registrationId])
  @@index([registrationId])
}

enum AccessStatus {
  LOCKED       // Admin explicitly locked; ignores dates
  OPEN         // Admin explicitly unlocked; ignores dates
  // (no override row = use default date-based logic)
}
```

### Modified Models

```prisma
model FormField {
  // ... existing fields preserved ...
  stepId        String
  step          Step  @relation(fields: [stepId], references: [id], onDelete: Cascade)

  @@index([stepId, order])
  // REMOVE: old relation directly to Event; fields now reach Event through Step → Phase
}

model Event {
  // ... existing fields ...
  phases        Phase[]
  // REMOVE: formFields relation (now reached through phases → steps)
}

model Registration {
  // ... existing fields ...
  phaseSubmissions PhaseSubmission[]
  phaseAccess      PhaseAccess[]
  // Registration.formData remains the home for REGISTRATION-phase data (backward compat)
}

model EventModules {
  // ... existing fields ...
  postRegPhases    Boolean  @default(false)  // NEW — toggles post-registration phase UI
}
```

**Why `Registration.formData` stays unchanged for the REGISTRATION phase:** Existing integrations, badge generation, email templates with `{{variable}}` substitution, and export routes all read from `Registration.formData`. Moving registration data into `PhaseSubmission` would touch every one of those. Keep the blast radius small — registration data keeps living on `Registration.formData`, only post-registration phases use `PhaseSubmission`.

---

## Migration Strategy

The migration runs in three passes. Each pass is a separate Prisma migration.

### Pass 1 — Add new schema with optional FK

Add `Phase`, `Step`, `PhaseSubmission`, `PhaseAccess` models. Add `stepId` to `FormField` as **nullable** for now. Deploy. Nothing breaks because nothing yet references the new tables.

### Pass 2 — Backfill

Run `prisma/scripts/migrate-to-phase-step-model.ts`:

```typescript
for each Event:
  if Phase with type=REGISTRATION already exists for this event: skip
  create Phase {
    eventId, type: REGISTRATION, title: "Registration", titleAr: "التسجيل",
    order: 0, isActive: true
  }
  create Step {
    phaseId: <new phase id>, title: "Details", titleAr: "التفاصيل", order: 0
  }
  for each FormField where eventId = event.id and stepId IS NULL:
    update FormField.stepId = <new step id>
```

Idempotent — re-running it is safe. Logs how many events, phases, steps, and fields were migrated.

### Pass 3 — Make FK required and clean up

Change `FormField.stepId` to non-nullable. Drop the direct `Event → FormField` relation (fields now reach Event through Step → Phase). Deploy.

### Rollback Plan

Before Pass 1 runs in production: snapshot the database (`pg_dump`). If any migration fails partway:

- **Pass 1 fails:** drop the new tables, restore snapshot. No data lost.
- **Pass 2 fails:** the backfill script is idempotent — fix the bug, re-run. If catastrophic, delete rows in new tables, restore snapshot.
- **Pass 3 fails:** revert `stepId` to nullable, redeploy. Data integrity preserved.

No destructive operation runs until Pass 3, and Pass 3 is trivially reversible by making the column nullable again.

---

## Behavior Specifications

### Multi-Step Registration Flow (REGISTRATION phase)

Public page: `src/app/(public)/register/[eventSlug]/page.tsx`

- Load the event's REGISTRATION phase with all steps and fields.
- Render a stepper header showing all step titles, current step highlighted, completed steps checkmarked.
- Render only the current step's fields in the body, respecting existing `showIf` conditional logic and `width` layout.
- Footer: **Back** button (hidden on step 0), **Next** button (or **Submit Registration** on the last step).
- Clicking Next validates all visible fields on the current step. If any fail, show inline errors and do not advance.
- Clicking Back never validates.
- URL stays in sync: `/register/[slug]?step=N`. Browser refresh preserves position.
- On successful final submit: POST to existing `/api/register/[eventSlug]` with one flat `formData` object (payload shape unchanged). Clear localStorage draft. Redirect to confirmation page.

**Draft saving:**
- Key: `registration-draft:${eventSlug}`.
- Payload: `{ currentStep: number, formData: Record<string, unknown>, savedAt: ISO-string }`.
- Debounced save (500ms) on every field change.
- On page load: if a draft exists and `savedAt` is within 7 days, restore state and show a small banner: *"Resumed from your last visit."* with a `[Start over]` link that clears the draft.
- Cleared on successful submission.

**Single-step events:** The stepper header is hidden when the REGISTRATION phase has exactly one step. The page looks identical to today's registration page. No admin action required.

### Post-Registration Phase Flow (POST_REGISTRATION phases)

Portal page: `src/app/(public)/portal/[eventSlug]/page.tsx`

- After attendee login (existing email + confirmation code flow), show their registration summary.
- Below that, render a list of POST_REGISTRATION phase cards for this event, ordered by `order`.
- Each card shows: phase title, description, status badge, and action button.

**Phase status logic (evaluated at request time):**

```
1. If PhaseAccess exists for (phase, registration):
     status = LOCKED  → render as "Not available"
     status = OPEN    → render as "Open" (ignore dates)

2. Else use date-based default:
     now < opensAt             → "Opens on <date>"  (disabled)
     opensAt ≤ now ≤ closesAt  → "Open"             (Fill / Edit button)
     now > closesAt            → "Closed"           (View-only if submitted, else hidden)

3. If a PhaseSubmission exists for (phase, registration):
     Overlay "Completed" indicator on any of the above.
```

**Filling a phase:** Opens a page at `/portal/[eventSlug]/phases/[phaseId]` that renders the phase's steps using the same stepper component as registration. On submit, creates or updates a `PhaseSubmission` row. Editable until the phase closes (unless LOCKED by override).

### Per-Attendee Phase Access Overrides

Admin page: `src/app/(dashboard)/dashboard/events/[eventId]/attendees/[contactId]/page.tsx`

Add a **Phase Access** panel to the attendee detail page listing every POST_REGISTRATION phase for this event. Each row shows:

- Phase name
- Default status (based on dates)
- Current effective status (default, or overridden)
- Toggle: **Default / Force Open / Force Locked**
- Optional reason field (free text)

Changing the toggle creates, updates, or deletes the `PhaseAccess` row. Resetting to "Default" deletes the override row.

Audit trail: every access change is logged with `unlockedBy` (admin user id), `unlockedAt`, and `reason`.

### Reminder Emails (no cron required)

When the `postRegPhases` module is enabled and a phase has `opensAt` set:

**Trigger mechanism:** On every dashboard page load for that event (cheap, already happens), run a small check:

```
for each Phase where type=POST_REGISTRATION, reminderSent=false, opensAt ≤ now, closesAt > now:
  queue a reminder email campaign using phase.reminderTemplateId (or default template)
  set reminderSent = true
```

This is eventual, not real-time. A phase that opens at midnight won't send reminders until an admin opens the dashboard the next morning. For event organizers that's acceptable and far cheaper than introducing a scheduler.

**Fallback:** a manual "Send reminder now" button on each phase in the admin UI.

**Future upgrade path:** when you're ready to add Vercel Cron or a proper scheduler, the trigger function is already factored out — swap the call site, no logic changes.

### Module Gating

Add `postRegPhases` to `EventModules` (default `false`). When off:
- Admin sees only the REGISTRATION phase in the form-builder; post-registration management UI is hidden.
- Portal hides the phases list (shows only registration summary).
- API endpoints for post-registration phases return 403 via `requireModule`.

Registration multi-step functionality is **not** gated by this flag — it's a universal upgrade to the REGISTRATION phase and available to every event.

---

## Admin UX Rework — Form Builder Page

The existing form-builder page (`src/app/(dashboard)/dashboard/events/[eventId]/form-builder/page.tsx`, 754 LOC) is the riskiest part of this project. **A visual mockup must be produced and approved before any code is written for the admin UI.**

### Required Layout

Left column: phase list.
- Pill or tab per phase (REGISTRATION always first, pinned).
- POST_REGISTRATION phases listed below if `postRegPhases` module is on, reorderable.
- "+ Add Phase" button at the bottom.

Middle column: step list for selected phase.
- Pill per step, reorderable.
- "+ Add Step" button.

Right column: field list for selected step.
- Existing field builder UI, unchanged.

### Deletion Guards

- Cannot delete the REGISTRATION phase.
- Cannot delete a phase that contains any step with any field. Admin must empty it first.
- Cannot delete the last step of a phase.
- Cannot delete a step that contains fields. Admin must move or delete fields first.

### Single-Phase Visual Simplification

If an event has only the REGISTRATION phase and only one step, the phase and step selectors are collapsed — the builder looks almost identical to today. Only when admin adds a second step (or the `postRegPhases` module turns on) do the hierarchical selectors appear. This keeps the simple case simple.

---

## Implementation Stages

Each stage is a mergeable chunk. Complete and verify one before starting the next.

### Stage 1 — Foundation (schema + migration)

- Add `Phase`, `Step`, `PhaseSubmission`, `PhaseAccess` models.
- Add `postRegPhases` to `EventModules`.
- Add optional `stepId` to `FormField`.
- Write and run the backfill script.
- Make `stepId` required. Drop direct `Event → FormField` relation.
- Verify every existing event still loads its registration page correctly.
- **Deliverable:** schema in place, all existing events have a REGISTRATION phase with one step, no functional change visible to users yet.
- **Merge and deploy to staging. Leave running one to two days before Stage 2.**

### Stage 2 — Admin form builder (UX mockup first, then code)

- Produce a visual mockup of the revised form-builder layout (HTML or detailed ASCII). Review and approve before coding.
- Implement the three-column phase/step/field layout.
- Implement add/rename/reorder/delete for phases and steps (with deletion guards).
- Field assignment to step is implicit (current selected step).
- "Move to step..." menu on each field for reassignment.
- Arabic title/description inputs for phases and steps when `multiLanguage` is on.
- **Deliverable:** admin can fully structure phases, steps, and fields. Public registration still renders as a single page (renderer not yet updated).

### Stage 3 — Public registration renderer (multi-step)

- Update `(public)/register/[eventSlug]/page.tsx` to render the REGISTRATION phase as a stepper.
- Per-step validation gate on Next.
- URL step sync (`?step=N`).
- localStorage draft saving with 7-day retention.
- Stepper hidden when phase has exactly one step.
- Verify existing events (pre-migration, one step) render identically to before.
- **Deliverable:** multi-step registration working end-to-end. Feature 1 is effectively shippable at this point.

### Stage 4 — Portal phase rendering

- Extend `(public)/portal/[eventSlug]/page.tsx` to list POST_REGISTRATION phases with correct status.
- New route `(public)/portal/[eventSlug]/phases/[phaseId]/page.tsx` that renders a phase using the Stage 3 stepper component (reused).
- `PhaseSubmission` create/update on submit.
- Respect `PhaseAccess` overrides in status calculation.
- **Deliverable:** attendees can see and fill post-registration phases through the portal.

### Stage 5 — Per-attendee access overrides

- Add **Phase Access** panel to `(dashboard)/dashboard/events/[eventId]/attendees/[contactId]/page.tsx`.
- Admin can set Default / Force Open / Force Locked per phase with optional reason.
- API endpoints for creating, updating, deleting `PhaseAccess` rows.
- Audit fields (`unlockedBy`, `unlockedAt`, `reason`) populated on every change.
- **Deliverable:** admins can unlock phase 3 for a specific VIP before phase 2 opens, exactly as requested.

### Stage 6 — Reminders + stats

- On-dashboard-load trigger for phase-open reminders (no cron).
- Manual "Send reminder now" button per phase in admin UI.
- Phase completion stats on `(dashboard)/dashboard/events/[eventId]/statistics/page.tsx` — completion count and rate per phase.
- **Deliverable:** reminder emails working, stats visible.

---

## Quality Disciplines (non-negotiable)

### Staging environment

Before Stage 1 runs in production, confirm a staging environment exists: separate Vercel project, separate Postgres database. Every stage deploys there first. Every stage is verified on staging with real data (or realistic seed data) before merging to main.

If there is no staging today, Stage 0 is "set up staging." This is not optional for a project of this scope.

### Test event harness

Seed script creates one realistic test event on staging with:

- 3 steps in its REGISTRATION phase (covering most field types + one `showIf` conditional)
- 3 POST_REGISTRATION phases (flight info with 2 steps, hotel info with 1 step, dietary with 1 step), with staggered open/close dates
- 5 seeded registrations for end-to-end testing

After every stage, run the full flow on this event: register as a new attendee, approve, check in, fill a post-registration phase, receive reminder, override phase access for one attendee. Takes ~15 minutes. Catches most regressions.

### Database snapshot before each migration

Before running Pass 1, Pass 2, or Pass 3 in production: `pg_dump` the database. Stash the snapshot in a safe place. Delete after the stage is verified stable for one week.

### Rollback scripts

For Pass 3's non-nullable constraint, write the down-migration SQL before running the up-migration. Prisma doesn't generate these automatically. Stash in `prisma/rollbacks/`.

### UX mockup before admin UI code

Stage 2 does not start coding until a visual mockup of the revised form-builder page is produced and approved. The existing page is dense; retrofitting without design discipline produces a worse page.

### Feature flag: `postRegPhases` module toggle

Post-registration phases are invisible unless the event's `postRegPhases` module is explicitly enabled. Protects all existing events from accidental complexity. Gives early adopter events opt-in access while the feature settles.

### No new infrastructure

This feature ships with zero new services, schedulers, queues, or third-party dependencies. Reminder emails use existing `EmailCampaign` infrastructure triggered on dashboard page load. If we later want real scheduling, we swap the trigger — the logic is already isolated.

---

## Acceptance Criteria

### Stage-level (each must pass before the next stage starts)

**Stage 1:**
- [ ] Every existing event has exactly one Phase (REGISTRATION type) with exactly one Step, and every FormField is assigned to that Step.
- [ ] Existing registration pages load and submit with no visible change to end users.
- [ ] Backfill script is idempotent (second run changes nothing).

**Stage 2:**
- [ ] UX mockup produced and approved before any UI code is written.
- [ ] Admin can create, rename, reorder, delete phases (with guards).
- [ ] Admin can create, rename, reorder, delete steps within a phase (with guards).
- [ ] Admin can move a field from one step to another.
- [ ] REGISTRATION phase cannot be deleted.
- [ ] Single-phase, single-step events render the builder near-identically to today.
- [ ] Arabic title/description inputs appear when `multiLanguage` is on.

**Stage 3:**
- [ ] Multi-step registration renders as a stepper with correct Next/Back behavior.
- [ ] Per-step validation blocks Next when required fields are missing.
- [ ] `showIf` conditionals work within a step.
- [ ] URL `?step=N` updates on navigation; refresh preserves position.
- [ ] localStorage draft restores after refresh; 7-day retention; Start-over clears it.
- [ ] Successful submission clears the draft.
- [ ] Single-step events render without the stepper header.
- [ ] Arabic + RTL render correctly.
- [ ] No regressions on existing badge generation, confirmation email, or approval workflow.

**Stage 4:**
- [ ] Portal lists POST_REGISTRATION phases with correct status badges.
- [ ] Phase fill page reuses Stage 3 stepper component.
- [ ] `PhaseSubmission` rows create and update correctly.
- [ ] Attendee can edit their submission until `closesAt`.
- [ ] Closed phases become view-only if previously submitted, hidden otherwise.

**Stage 5:**
- [ ] Admin can override phase access to Force Open or Force Locked.
- [ ] Resetting to Default removes the override.
- [ ] Overrides correctly bypass date checks.
- [ ] Audit fields (`unlockedBy`, `unlockedAt`, `reason`) captured.

**Stage 6:**
- [ ] Phase-open reminder emails fire on first dashboard load after `opensAt`.
- [ ] Each phase sends at most one automatic reminder (`reminderSent` guard).
- [ ] Manual "Send reminder now" button works regardless of `reminderSent`.
- [ ] Statistics page shows per-phase completion counts and rates.

### Whole-feature:

- [ ] All 6 stages deployed and verified on staging.
- [ ] Test event harness runs clean end-to-end.
- [ ] No existing event required manual admin action to keep working.
- [ ] Bilingual content (English + Arabic) renders correctly throughout.
- [ ] `postRegPhases` module toggle correctly gates all post-registration UI.
- [ ] Database snapshots exist for each production migration and have been verified.

---

## Open Questions

1. **Draft retention:** 7 days in localStorage is a guess. Shorten to 3 days, extend to 14, or make configurable?
2. **Reorder UX:** drag-and-drop or up/down arrow buttons in v1? Arrows are simpler; drag is nicer. Default: up/down arrows for v1, drag later.
3. **Reminder email template:** one default "phase opened" template per event, or one per phase? Default: per-phase with event-level default.
4. **Partial registration stats:** should admins see "how many people started registering but didn't finish"? Requires server-side draft rows, not just localStorage. Default: no for v1.
5. **Phase completion required for badge generation:** if a phase is marked `isRequired`, should failure to complete it block check-in? Default: no — `isRequired` is informational only in v1.

---

## Notes for Claude Code

- This spec replaces the earlier `REGISTRATION_SYSTEM_IMPROVEMENT_PLAN.md`. Most phases in that plan are already implemented in the codebase.
- Do not modify `Registration.formData` shape or the `/api/register/[eventSlug]` payload. Registration-phase data keeps living on `Registration.formData`.
- Run `npx prisma generate` after every schema edit.
- Do not add tests unless explicitly asked (per CLAUDE.md).
- Honor existing patterns: services in `src/lib/services/`, Zod schemas in `src/lib/validations/`, `requireModule` guards on gated routes.
- Commit in logical chunks within each stage: one commit per sub-deliverable. Push each stage as a separate branch or PR.
- Do not start Stage 2 implementation code until the UX mockup is approved. Produce the mockup first, even if it feels slow.
- Do not proceed to the next stage if the current stage's acceptance criteria are not all green on staging.
- If you discover the spec is wrong or incomplete mid-implementation, stop and surface the issue rather than improvising.

---

*Approved for implementation, stage by stage, with staging verification between stages.*
