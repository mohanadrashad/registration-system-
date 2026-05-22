# Admin Edit — Fix It Properly

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation in 4 sequential stages. Resolves four findings surfaced by the pre-flight audit (CSV-drift bug, missing audit trail, API permission gap, admin-replace FILE gap).
**Prerequisites:** All previous features deployed and stable in production (Phase-Based Forms, Phase Selections, Category Phases, FILE field stages 1-3, Email-Optional Events stages 1-3).

---

## Overview

The admin-edit flow on the attendee detail page has four problems that compound:

1. **CSV-drift bug.** When admin edits a non-Contact-column field (dietary preferences, t-shirt size, etc.), the change is written to `Contact.metadata` but NOT to `Registration.formData`. The CSV export reads from `formData`, so admin edits never reach the CSV. Every event that had admin edits has produced stale CSV exports without anyone noticing.

2. **No audit trail.** When admin edits a registration, no record is kept of who edited what when. `Contact.updatedAt` advances, but the editor's identity is lost. Approval/rejection accepts an actor id and a reason but silently drops both.

3. **API permission gap.** The core attendee-edit endpoint (`PUT /api/events/[eventId]/contacts/[contactId]`) checks the caller's global role but NOT their per-event membership. A user with global EDITOR on Event A can edit contacts on Event B by hitting the API directly. The UI hides the button; the API is open. Same gap on Add Contact, Delete Contact, and Approvals routes.

4. **FILE fields are read-only.** Stage 2 of the FILE field feature deliberately deferred admin-replace to v2. Today, when a visitor uploads the wrong file and emails the correct one, admin has no dashboard option to fix it. The Stage 2 read-only label explicitly says "admin replace/remove arrives in v2."

All four problems live in the same code paths — the admin-edit flow on the attendee detail page, the underlying `PUT /api/events/[eventId]/contacts/[contactId]` endpoint, and the surrounding services. Fixing them piecemeal would touch the same files four times. This spec fixes them together in four sequential stages.

---

## Goals

- Admin edits to formData fields land in BOTH `Contact.metadata` AND `Registration.formData`. CSV exports reflect admin corrections.
- Every admin edit captures the editor's identity (`updatedBy`) and timestamp (`updatedAt` continues to advance). `Contact.updatedBy` and `Registration.updatedBy` are queryable.
- Approvals capture the approver, rejector, and rejection reason. No more silent drops.
- The core attendee-edit endpoints (PUT/POST/DELETE contacts, POST approvals) check per-event membership via `authorizeEvent`. Closes the API permission gap.
- Admin can replace a visitor's FILE field upload from the dashboard. New file goes through the same upload pipeline as visitor uploads, with admin-attribution in `uploadedBy`. Old file is deleted from blob storage. The replacement is audited.
- Existing admin workflows continue working — no UI flow becomes more painful, no extra steps where they don't add value.

## Non-Goals

- A separate `AuditLog` table with per-field history. Pattern A (columns) is the v1 shape; AuditLog is reserved for when multi-admin editing becomes common.
- Admin upload of files that don't exist yet (new uploads, not replacements). Out of scope; the visitor flow is the right primary path. Admin-only is for fixing wrong-file submissions, not initial collection.
- Bulk admin replace (replace files for multiple registrations at once). Out of scope. Per-row replace covers the operational gap.
- Visitor-side notification when admin edits their data. Useful but out of scope — would require email infrastructure that doesn't exist for this case. Add later if asked.
- Editing post-registration phase submissions (`PhaseSubmission.data`). Out of scope. The attendee detail page deliberately scopes its formField fetch to REGISTRATION-phase fields; post-reg phases have their own per-phase cards with their own editing surface (currently read-only, separate concern).
- Reverting an admin edit. The audit trail records who changed what, but doesn't include the old value (Pattern A's limitation). Reverting requires Pattern B AuditLog, deferred.
- Reconciling existing rows where admin previously edited `Contact.metadata` without updating `Registration.formData`. Going-forward fix only; historical drift is acknowledged in the PR description as a known data-state issue. Cleanup is a separate small project.

---

## Architecture

### CSV-drift fix

The current admin save flow (`page.tsx:101-150` → `PUT /api/events/[eventId]/contacts/[contactId]`):

```
For each visible field:
  If Contact-column field → columnUpdates[name] = value
  Else → metadataUpdates[name] = value

PUT body = { ...columnUpdates, metadata: metadataUpdates, category, status }
```

The endpoint writes columns and metadata to `Contact`. Nothing writes to `Registration.formData`.

The fix is server-side: when the admin-edit endpoint receives a contact PUT, it also updates the matching `Registration.formData`:

1. Look up the Registration row by contactId (1:1 via `Registration.contactId`).
2. Merge the incoming non-Contact-column fields into the existing `Registration.formData` JSON.
3. Write back in the same transaction as the Contact update.

`formData` keys correspond to `FormField.name`. The CSV export already uses these keys; after the fix, admin edits flow through naturally.

Edge cases:
- No `Registration` exists yet (contact is IMPORTED/INVITED, not yet registered). Skip the formData write. Only Contact gets updated.
- The Contact-column edit (firstName, email, etc.) — those don't go into formData; they stay on Contact only. No change to that behavior.
- The field doesn't exist on any FormField (legacy data, deleted fields). Still write to metadata for backward compat; also write to formData under the same key. CSV export only reads keys that match active FormFields, so legacy keys are harmless.

### Audit trail (Pattern A)

Add `updatedBy String?` to `Contact` and `Registration`. Both reference `User.id`. Both nullable because some rows have edit history pre-dating this feature.

```prisma
model Contact {
  // ... existing fields ...
  updatedBy String?
  updater   User?    @relation(name: "ContactUpdater", fields: [updatedBy], references: [id])
}

model Registration {
  // ... existing fields ...
  updatedBy String?
  updater   User?    @relation(name: "RegistrationUpdater", fields: [updatedBy], references: [id])
}
```

Every admin write to either table captures the actor:
- Contact PUT → set `updatedBy = ctx.session.user.id`
- Contact POST (add) → set `updatedBy = ctx.session.user.id` on creation
- Registration formData write (via the contact PUT, see CSV-drift fix above) → set `updatedBy = ctx.session.user.id`
- Approval/rejection/promotion/cancel → set `updatedBy` on the affected Registration row

The dashboard displays this on the attendee detail page identity card or admin metadata card as "Last edited by [Name] on [date]" when `updatedBy` is non-null and is a different user than the visitor themselves (i.e., not visible if the only "edit" was the visitor's own registration submission).

### Approval flow — actually persist the captured data

Current state: `approvalService.approve(registrationId, approvedBy?)` and `.reject(registrationId, reason?, rejectedBy?)` accept the actor and reason but never write them.

Fix: add the actor and reason fields to the schema and write them:

```prisma
model Registration {
  // ... existing fields ...
  approvedBy        String?
  approvedAt        DateTime?
  rejectedBy        String?
  rejectedAt        DateTime?
  rejectionReason   String?

  approver User? @relation(name: "RegistrationApprover", fields: [approvedBy], references: [id])
  rejecter User? @relation(name: "RegistrationRejecter", fields: [rejectedBy], references: [id])
}
```

The approval service stops dropping the parameters; the approvals route already passes `ctx.session.user.id` correctly.

### API permission gating (close the open API)

Four routes need migration from `auth() + canEdit/canDelete` to `authorizeEvent`:

| Route | Current | New |
|---|---|---|
| `PUT /api/events/[eventId]/contacts/[contactId]` | `auth() + canEdit` | `authorizeEvent(eventId, { role: "editor" })` |
| `POST /api/events/[eventId]/contacts` | `auth() + canEdit` | `authorizeEvent(eventId, { role: "editor" })` |
| `DELETE /api/events/[eventId]/contacts/[contactId]` | `auth() + canDelete` | `authorizeEvent(eventId, { role: "manager" })` |
| `POST /api/events/[eventId]/approvals` | `authorize("editor")` (global) | `authorizeEvent(eventId, { role: "editor" })` |

`authorizeEvent` is the established pattern from CLAUDE.md and existing PhaseAccess/Selections routes. Returns the EventAuthContext with `session`, `eventRole`, and `event`. The migration is mostly mechanical.

Permission semantics post-fix:
- Edit a contact → must be an `EVENT_MEMBER` (any role ≥ EDITOR on that specific event). SUPER_ADMIN bypasses.
- Delete a contact → must be ≥ MANAGER on that event.
- Approve/reject → must be ≥ EDITOR on that event.
- The legacy global-role check is gone for these surfaces. SUPER_ADMIN still bypasses everything per `authorizeEvent` semantics.

### Admin-replace FILE

Add Replace and Remove affordances to the FILE branch of `FieldEditInput`. Today it's a read-only label; after this stage, the same label shows with two buttons next to it: `[Replace]` and `[Remove]`.

**Replace flow:**

1. Admin clicks Replace next to a FILE field on the edit dialog.
2. A confirm dialog appears: "Replace the visitor's uploaded file? The original file will be deleted."
3. After confirm, opens a file picker (using `<input type="file">`).
4. Admin selects a file. Client-side validates against the FormField's metadata (max size, allowed MIME types).
5. Client uploads to a new admin-side endpoint: `POST /api/events/[eventId]/contacts/[contactId]/files/[formFieldId]/replace`. The request goes through admin's NextAuth session, not the `reg_upload_session` cookie. The server issues a Vercel Blob upload token scoped to `{ eventId, contactId, formFieldId, source: "admin" }`.
6. Client uploads directly to Vercel Blob (same `@vercel/blob/client` flow as visitor upload).
7. `onUploadCompleted` webhook on the same admin route creates a new `RegistrationFile` row with `uploadedBy = "admin:<userId>"` and `registrationId` set immediately (admin upload bypasses the session-tied flow because the registration already exists).
8. In the same transaction, the OLD `RegistrationFile`'s blob is deleted via `del(blobPath)`, the old row is deleted, and the new file is linked. The `formData[fieldName]` denormalized reference is updated to the new fileId/filename/mimeType/sizeBytes.
9. `Registration.updatedBy` is set to the admin's user id.

**Remove flow:**

1. Admin clicks Remove next to a FILE field.
2. Confirm dialog: "Remove the visitor's uploaded file? This cannot be undone."
3. After confirm, the OLD blob is deleted, the OLD `RegistrationFile` row is deleted, and `formData[fieldName]` is set to `null`.
4. `Registration.updatedBy` is set to the admin's user id.

**Required-field handling:** if the FILE field is required and the admin removes the file, the registration enters a "required field missing" state. The dashboard surfaces this as a warning on the attendee detail page ("This registration is missing required data: <field name>"). The registration isn't blocked from check-in or other operations — just flagged. Fixing it is the admin's responsibility (re-uploading via Replace).

### Audit trail display

On the attendee detail page header (below the name), add a muted line when `updatedBy` is set and refers to a different user than the visitor:

```
SmokeTest Three
Last edited by Mohanad Rashad · 2 days ago
```

For FILE fields specifically, the edit dialog's FILE branch shows the upload provenance:
- `Uploaded by visitor` (when `uploadedBy` starts with `registration:`)
- `Uploaded by [Admin Name]` (when `uploadedBy` starts with `admin:`)

This makes admin-replaced files visually distinct from visitor-uploaded ones.

---

## Schema Changes

Three additive changes. Single Prisma migration.

```prisma
model Contact {
  // ... existing ...
  updatedBy String?
  updater   User?    @relation(name: "ContactUpdater", fields: [updatedBy], references: [id])

  @@index([updatedBy])
}

model Registration {
  // ... existing ...
  updatedBy        String?
  approvedBy       String?
  approvedAt       DateTime?
  rejectedBy       String?
  rejectedAt       DateTime?
  rejectionReason  String?  @db.Text

  updater  User? @relation(name: "RegistrationUpdater", fields: [updatedBy], references: [id])
  approver User? @relation(name: "RegistrationApprover", fields: [approvedBy], references: [id])
  rejecter User? @relation(name: "RegistrationRejecter", fields: [rejectedBy], references: [id])

  @@index([updatedBy])
  @@index([approvedBy])
}

model User {
  // ... existing ...
  contactsUpdated      Contact[]      @relation(name: "ContactUpdater")
  registrationsUpdated Registration[] @relation(name: "RegistrationUpdater")
  registrationsApproved Registration[] @relation(name: "RegistrationApprover")
  registrationsRejected Registration[] @relation(name: "RegistrationRejecter")
}
```

All nullable, all additive. Existing rows get NULL on the new columns. No backfill needed; pre-existing edit history is acknowledged as unrecoverable.

---

## Behavior Specifications

### Admin save flow — post-fix

When admin clicks Save on the edit dialog:

1. `handleSave()` walks visible fields, routes column fields → `columnUpdates`, formData fields → `formDataUpdates`.
2. PUT to `/api/events/[eventId]/contacts/[contactId]` with `{ ...columnUpdates, formData: formDataUpdates, category, status }`.
3. Server validates via `updateContactSchema` (extended to include `formData`).
4. Server runs in a transaction:
   - `authorizeEvent(eventId, { role: "editor" })` — verifies caller is an event member with edit role.
   - Update Contact columns + metadata (merge `formDataUpdates` into existing metadata for back-compat).
   - Look up Registration by contactId; if exists, merge `formDataUpdates` into `Registration.formData` JSON.
   - Set `Contact.updatedBy = ctx.session.user.id`.
   - Set `Registration.updatedBy = ctx.session.user.id` if Registration was touched.
5. Return success. Dashboard re-renders with fresh data.

### Approval flow — post-fix

When admin approves/rejects:

1. Route call: `authorizeEvent(eventId, { role: "editor" })`.
2. Service call passes `ctx.session.user.id` and (for reject) the reason.
3. Service writes to `Registration.approvedBy/approvedAt` (or `rejectedBy/rejectedAt/rejectionReason`) instead of dropping the values.
4. `Registration.updatedBy` also set (the approval IS an edit).

### Admin-replace FILE flow — UI

The Stage 2 read-only label:

```
Commercial Registration

  📄 commercial-registration.pdf · 482 KB · PDF
  Visitor-uploaded — admin replace/remove arrives in v2.
```

Becomes:

```
Commercial Registration

  📄 commercial-registration.pdf · 482 KB · PDF
  Uploaded by visitor on 2026-05-12.   [Replace]   [Remove]
```

If the file was already admin-replaced once:

```
Commercial Registration

  📄 corrected-cr.pdf · 520 KB · PDF
  Uploaded by Mohanad Rashad on 2026-05-22 (replaced visitor upload).   [Replace]   [Remove]
```

### Admin-replace FILE flow — server

`POST /api/events/[eventId]/contacts/[contactId]/files/[formFieldId]/replace`:

1. `authorizeEvent(eventId, { role: "editor" })`.
2. Validate `formFieldId` belongs to this event and is a FILE field.
3. Confirm the registration exists for this contact.
4. Use `handleUpload` from `@vercel/blob/client` to issue an upload token with payload `{ eventId, contactId, formFieldId, source: "admin", actorId }`.
5. Return the token. Client uploads.
6. On webhook (`onUploadCompleted`):
   - Verify token payload.
   - In a transaction:
     - Look up the existing `RegistrationFile` for `(registrationId, formFieldId)`.
     - Delete the old blob via `del(oldBlobPath)`. Best-effort; failure is logged but doesn't block the row swap.
     - Delete the old `RegistrationFile` row.
     - Create the new `RegistrationFile` row with `uploadedBy = "admin:<actorId>"`, `registrationId` set immediately.
     - Update `Registration.formData[fieldName]` with the new denormalized reference.
     - Set `Registration.updatedBy = actorId`.

`DELETE /api/events/[eventId]/contacts/[contactId]/files/[fileId]` (admin remove):

1. `authorizeEvent(eventId, { role: "editor" })`.
2. Validate the file belongs to a registration on this event and to a FormField on this event (cross-checks).
3. In a transaction:
   - Delete the blob.
   - Delete the `RegistrationFile` row.
   - Update `Registration.formData[fieldName] = null`.
   - Set `Registration.updatedBy`.
4. If the FormField is required, the registration is now in a missing-required-data state; the dashboard's attendee detail page surfaces this.

### Required-field warning UI

When the attendee detail page loads, check each REGISTRATION-phase FormField that's `required: true` against the current value in `Registration.formData`. If any required field has a null/missing value, render a warning at the top of the page:

```
⚠️ This registration is missing required data:
   - Commercial Registration
```

The warning includes a link to the edit dialog. The check is read-only — no enforcement on existing flows (check-in, badge, etc. continue to work).

---

## Implementation Stages

Four stages. Each mergeable on its own. Each verified on staging before the next.

### Stage 1 — CSV-drift fix + audit trail (schema)

The plumbing layer. Two schema changes + one server-side fix. No new UI.

**Schema:**
- Add `Contact.updatedBy` + relation.
- Add `Registration.updatedBy/approvedBy/approvedAt/rejectedBy/rejectedAt/rejectionReason` + relations.
- Run schema push to staging (Mohanad runs manually).

**Server changes:**
- Extend `updateContactSchema` to accept a `formData` field (Record<string, unknown>).
- In the Contact PUT handler, after updating Contact, look up the linked Registration and merge incoming formData updates into `Registration.formData` in the same transaction.
- Set `Contact.updatedBy` and `Registration.updatedBy` from session user id.
- Approval service: stop dropping `approvedBy`, `rejectedBy`, `rejectionReason`. Write them to the new columns.
- Update the admin client (the dashboard's `handleSave`) to actually send formData updates in a separate field (currently they go via the `metadata` blob with no special handling).

**No UI changes yet.** The "Last edited by" display lands in Stage 4.

**Smoke test:**
1. As admin, edit a non-Contact-column field on a registration (e.g., dietary preference).
2. Verify `Contact.metadata` updated (existing behavior).
3. Verify `Registration.formData` ALSO updated (the fix).
4. Export CSV. Confirm the edited value appears in the CSV column (not the stale value).
5. Verify `Contact.updatedBy` and `Registration.updatedBy` capture the admin's user id.
6. Approve a pending registration. Verify `Registration.approvedBy` and `approvedAt` are set.
7. Reject a pending registration with a reason. Verify `rejectedBy`, `rejectedAt`, `rejectionReason` all set.

**Deliverable:** CSV exports are correct after admin edits. Approval and edit metadata captured. No UI changes visible to admins yet.

### Stage 2 — API permission gating

Migrate the four routes from global-role checks to per-event `authorizeEvent`.

**Routes:**
- `PUT /api/events/[eventId]/contacts/[contactId]` → `authorizeEvent(eventId, { role: "editor" })`.
- `POST /api/events/[eventId]/contacts` → `authorizeEvent(eventId, { role: "editor" })`.
- `DELETE /api/events/[eventId]/contacts/[contactId]` → `authorizeEvent(eventId, { role: "manager" })`.
- `POST /api/events/[eventId]/approvals` → `authorizeEvent(eventId, { role: "editor" })`.

**Risk:** the migration changes WHO can call these routes. A user with global EDITOR but no EventMember row will start getting 403 where they previously succeeded. The audit found that the UI already gates page access for these users, so in practice the dashboard flow shouldn't break — but verify on staging with multiple test users.

**Audit before code:** confirm whether any non-UI consumer (cron jobs, webhooks, internal tools) hits these endpoints with credentials that lack EventMember rows. If yes, those consumers need EventMember rows added, or the migration needs a per-route exception.

**Smoke test:**
1. As a user with global EDITOR but no EventMember on event A, try to edit a contact on event A. Confirm 403.
2. Add the user as EventMember(EDITOR) on event A. Retry. Confirm 200.
3. As a user with global VIEWER but EventMember(EDITOR) on event A. Edit a contact. Confirm 200 (per-event role wins).
4. Verify SUPER_ADMIN bypasses everywhere as before.

**Deliverable:** API permission gap closed. Per-event membership is now properly enforced on the core attendee-edit surfaces.

### Stage 3 — Admin-replace FILE

The biggest stage. New UI affordance, new server endpoints, new flow.

**Server:**
- `POST /api/events/[eventId]/contacts/[contactId]/files/[formFieldId]/replace` — issues admin-side Vercel Blob upload token.
- `onUploadCompleted` webhook on the same route — completes the swap in a transaction (delete old blob/row, create new row, update formData, set updatedBy).
- `DELETE /api/events/[eventId]/contacts/[contactId]/files/[fileId]` — admin remove (no upload, just delete + null out formData).

**Service helpers:**
- Extend `registration-file.service.ts` with `adminReplaceFile(...)` and `adminRemoveFile(...)`. Mirror the existing visitor-side helpers' patterns; reuse the blob utilities from `src/lib/blob.ts`.

**UI:**
- Update `field-edit-input.tsx` FILE branch:
  - Show provenance ("Uploaded by visitor" or "Uploaded by [Name]").
  - Add Replace and Remove buttons.
  - Wire the buttons through confirm dialogs + the new endpoints.
- Add required-field warning to the attendee detail page (renders when any required FormField has a null/missing value in `formData`).

**Mockup required before code:**
- The new FILE branch UI (provenance line + Replace + Remove buttons + confirm dialogs).
- The required-field warning placement on the attendee detail page.

**Smoke test:**
1. Visitor registers with a FILE field, uploads a file.
2. Admin opens edit dialog, sees the file with "Uploaded by visitor" provenance and Replace/Remove buttons.
3. Click Replace → confirm dialog → file picker → upload new file → verify old blob deleted, new RegistrationFile row with `uploadedBy = "admin:<id>"`, `formData[fieldName]` updated, `Registration.updatedBy` set.
4. Click Remove → confirm dialog → verify blob and row both deleted, `formData[fieldName] = null`, `Registration.updatedBy` set.
5. Open edit dialog again. The FILE field shows in its "empty + required" state. Warning banner at top of page lists the missing required field.
6. Click Replace, upload a new file. Verify the warning banner disappears.
7. Verify CSV export reflects the latest filename.

**Deliverable:** admin can replace and remove visitor-uploaded files. Provenance visible. Required-field warning surfaces missing data.

### Stage 4 — Audit trail display + polish

The user-visible payoff of the audit trail captured in Stages 1 and 3.

**UI changes:**
- Attendee detail page header: show "Last edited by [Name] · [relative time]" when `updatedBy` is non-null and refers to a different user than would have submitted the original registration.
- Approvals dashboard: when displaying approval/rejection events, show who approved/rejected and (for rejections) the reason.
- (Optional) Admin metadata card on the attendee detail page: show approval/rejection metadata explicitly (approver, approvedAt, rejecter, rejectedAt, reason).

**Smoke test:**
1. Admin edits a contact. Reload the page. Confirm the header shows "Last edited by [Your Name] · just now."
2. Wait a minute, reload. Confirm the relative time updates to "1 minute ago."
3. Approve a pending registration. Open the approvals dashboard. Confirm the approval entry shows the approver's name.
4. Reject another pending registration with a reason. Confirm the rejection entry shows rejecter + reason.

**Deliverable:** audit trail is visible to admins. Editing accountability is clear.

---

## Quality Disciplines

### Single migration per stage

Stage 1's schema change is the biggest (6 new columns + 4 relations + 3 indexes). Stage 3 may need an additional `RegistrationFile` field if the audit reveals one. Stages 2 and 4 are pure code, no schema.

### Mockup before UI code

Stage 3's FILE-branch redesign needs a mockup before code (per CLAUDE.md). Stage 4's "Last edited by" placement also benefits from a quick mockup.

### Pre-flight audit before each stage

Standard pattern. Stage 2's audit is particularly important — confirm no non-UI consumer relies on the global-role permission semantics.

### No new infrastructure

Same as previous features. Vercel Blob is already provisioned. No new env vars. No new cron entries. The admin-side upload endpoint reuses the same SDK and storage.

### Backwards compatibility

- Pre-existing edits without `updatedBy` show no "Last edited by" line. Acknowledged in the PR description.
- Pre-existing registrations with `formData` drift (the original CSV-drift bug effect) are not retroactively fixed. New edits going forward write to both stores correctly. The historical drift is unrecoverable without per-event data inspection; flagged but not in scope.
- Existing FILE fields with `uploadedBy = "registration:<id>"` continue to show "Uploaded by visitor." Admin-replaced files will show "Uploaded by [Name]."
- Stage 2's permission gating change is a real behavior change. Users who previously could edit cross-event will get 403. The fix is to add the appropriate EventMember rows; flagged in PR description with the migration path.

### Smoke tests at end of each stage

Stages 1 and 2 have backend-heavy smoke tests; Stages 3 and 4 are UI-heavy. All four stages' smoke tests are required gates before squash-merge.

---

## Acceptance Criteria

### Stage 1
- [ ] Schema migration adds `Contact.updatedBy`, `Registration.updatedBy/approvedBy/approvedAt/rejectedBy/rejectedAt/rejectionReason` with relations.
- [ ] Staging schema push verified by query.
- [ ] Contact PUT writes both `Contact.metadata` and `Registration.formData` when formData fields change.
- [ ] `updatedBy` set on every Contact and Registration write from an admin action.
- [ ] Approval service writes `approvedBy/approvedAt/rejectedBy/rejectedAt/rejectionReason` instead of dropping.
- [ ] CSV export reflects admin edits to formData fields after Stage 1 ships.
- [ ] No UI changes; existing flows unaffected.

### Stage 2
- [ ] Four routes migrated to `authorizeEvent`.
- [ ] Audit confirms no non-UI consumers break.
- [ ] Users without EventMember on an event get 403 on those routes; users with EventMember on the event succeed.
- [ ] SUPER_ADMIN bypass preserved.

### Stage 3
- [ ] Mockup of FILE-branch redesign approved before code.
- [ ] Admin-replace endpoint and webhook implemented.
- [ ] Admin-remove endpoint implemented.
- [ ] FILE branch shows provenance line, Replace and Remove buttons, confirm dialogs.
- [ ] Replacement deletes old blob, creates new RegistrationFile with `uploadedBy = "admin:<id>"`, updates `formData`, updates `Registration.updatedBy`.
- [ ] Remove deletes blob and row, nulls out `formData`, updates `Registration.updatedBy`.
- [ ] Required-field warning surfaces on attendee detail page when required FormField has null value.
- [ ] Smoke test (~7 steps) passes.

### Stage 4
- [ ] Attendee detail header shows "Last edited by [Name] · [time]" when applicable.
- [ ] Approvals dashboard shows approver/rejecter/reason when applicable.
- [ ] No regression on existing approval, rejection, or attendee detail flows.

### Whole feature
- [ ] All 4 stages deployed and verified on staging.
- [ ] CSV-drift bug closed.
- [ ] API permission gap closed.
- [ ] Audit trail visible.
- [ ] Admin-replace FILE working end-to-end.
- [ ] No existing event required manual admin action to keep working.

---

## Open Questions

These can be decided during implementation, but Claude Code should surface its choice in each PR description rather than silently picking.

1. **`updatedBy` display threshold.** Should "Last edited by" show on the attendee detail page when the editor IS the original visitor (e.g., admin edits a visitor's own self-modified registration)? Default: yes, but with different copy ("Last updated by visitor"). Better to over-disclose than hide attribution.

2. **Admin-remove on required FILE fields.** Should removal be blocked when the field is required, or just warned? Default: warn but allow. Admin knows what they're doing; blocking creates a worse footgun (admin can't fix a wrong file without first uploading a placeholder).

3. **Cross-event blob orphan.** If admin-replace fails partway (old blob deleted, new file uploaded, transaction fails), we have an orphan blob. Default behavior: catch in the existing nightly orphan-cleanup cron (extend it to also match orphan admin-replaced blobs via a known path pattern, or rely on the `RegistrationFile` orphan-by-null-registrationId logic — Stage 3 needs to confirm the cleanup pattern catches admin-replace partial failures).

4. **Provenance line format.** "Uploaded by visitor on YYYY-MM-DD" vs "Uploaded by visitor 2 days ago." Default: relative time matching existing patterns elsewhere in the dashboard.

5. **What happens to Stage 2's permission gating when SUPER_ADMIN edits a contact?** Does `Contact.updatedBy` capture the SUPER_ADMIN's id? Default: yes. SUPER_ADMIN actions are still audit-trail-worthy.

---

## Notes for Claude Code

- This spec replaces no earlier spec. It's net-new.
- Four stages, four separate PRs.
- Stage 1 is the most schema-heavy; Stages 2-4 are progressively smaller.
- Stage 2's audit is critical — surface findings before code, especially any non-UI permission-dependent paths.
- Stage 3's FILE-branch redesign needs a mockup approved before code.
- Honor existing patterns: services in `src/lib/services/`, validations in `src/lib/validations/`, `authorizeEvent` for event-scoped routes.
- Don't add tests unless explicitly asked.
- One commit per logical chunk within each stage. Push each stage as its own PR.
- Smoke tests at end of each stage are required gates before squash-merge.
- The CSV-drift fix in Stage 1 is the highest-priority sub-feature. Even if subsequent stages are delayed, Stage 1 alone closes a real production bug.

---

*Approved for implementation, stage by stage, with staging verification between stages.*
