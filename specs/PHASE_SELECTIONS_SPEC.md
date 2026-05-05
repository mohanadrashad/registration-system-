# Phase Selections — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation in 5 sequential stages. Builds on top of the Phase / Step / FormField system already shipped.
**Prerequisites:** All 6 stages of `PHASE_BASED_FORMS_SPEC.md` are deployed and stable in production.

---

## Overview

Post-registration phases today collect free-form answers (`PhaseSubmission.data` JSON). This spec adds a second, complementary capability: **selecting from a pre-defined list of options**, with capacity limits, admin pre-assignment, and optional receipt upload.

The classic example is a "Hotel" or "Flight" phase: admin defines options (Marriott, Hilton, Self-arrange), some attendees are pre-assigned by the admin (covered hotels for VIPs), others pick for themselves, and "self-arrange" attendees upload a booking receipt as proof of completion. The same model handles workshops (pick 3 of 8), parking spots, transfer slots, meal packages, table assignments — anything where the answer is "one or more of N pre-defined choices."

The system has zero hardcoded knowledge of what an option *is*. The phase title, the option labels, and the option metadata are all admin-configured. Reusable for any "pick from list" scenario without code changes.

---

## Goals

- An admin can attach a list of selectable options to any post-registration phase.
- Each option carries a label, optional description, optional capacity, optional external link, and a free-form metadata blob.
- Per phase, the admin chooses a selection mode that controls who picks and how:
  - **ADMIN_ASSIGNED** — admin picks for every attendee; attendee sees their assignment read-only.
  - **ATTENDEE_PICKS** — attendees pick for themselves from the option list.
  - **MIXED** — admin can pre-assign some attendees; the rest pick for themselves.
  - **EXTERNAL_BOOKING** — options are informational only (a list of hotels with booking links); attendees book externally and upload a receipt.
- A phase can require multiple selections (`maxSelections > 1`) for workshops-style scenarios.
- Capacity is enforced for attendee picks but admin can force-assign past capacity with a warning.
- When a phase requires receipt upload (configurable per option or per phase), the phase is "completed" only after the file is uploaded.
- A phase can have BOTH options AND regular FormFields — they live side by side on the same step(s).
- Admins manage assignments from the existing attendee detail page in a new "Selections" tab.
- Admins see per-option attendee lists and CSV export from the statistics page (for transport / catering planning).
- Other attendees never see who else picked the same option.
- All existing post-registration phases continue working unchanged. The new Options panel is opt-in per phase.

## Non-Goals

- Bulk import of options (CSV upload). Deferred to v2; v1 is manual entry only.
- Waitlists on full options. Deferred to v2.
- Sub-options or option variants (e.g., "Marriott — single room" vs. "Marriott — double room"). Modelled today via metadata or by creating two separate options.
- Cross-phase selection logic (e.g., "if Hotel = X then Flight options are Y, Z").
- Real-time capacity counters in the attendee UI (we show capacity-at-page-load; we do not push live updates as others select).
- Receipt approval workflow. Upload is the completion signal.
- Sharing receipt files across attendees, or attendees seeing one another's selections.

---

## Architecture

Three new tables. One existing table (`Phase`) gains a few columns. No data migration is required — every existing phase defaults to "no options," which behaves identically to today.

```
   Phase (existing)
      │  selectionMode, maxSelections, allowChangeAfterSubmit, requiresReceiptUpload
      ▼
   ┌──────────────────────────────────────────────┐
   │  PhaseOption  — admin-defined choices         │
   │  • label, description, externalUrl            │
   │  • capacity (nullable)                        │
   │  • metadata (free JSON)                       │
   │  • order, isActive                            │
   └──────────────────────────────────────────────┘
              │
              │  has many
              ▼
   ┌──────────────────────────────────────────────┐
   │  AttendeeSelection — who got what             │
   │  • registrationId, optionId                   │
   │  • source: ADMIN_ASSIGNED | ATTENDEE_PICKED   │
   │  • assignedBy, assignedAt, notes              │
   │  • receiptFileId (FK to PhaseReceipt)         │
   └──────────────────────────────────────────────┘
              │
              │  has zero or one
              ▼
   ┌──────────────────────────────────────────────┐
   │  PhaseReceipt — uploaded files                │
   │  • blobUrl, blobPath                          │
   │  • mimeType, sizeBytes, originalName          │
   │  • uploadedAt, uploadedBy                     │
   └──────────────────────────────────────────────┘
```

**Why a separate `PhaseReceipt` table** instead of inlining the URL on `AttendeeSelection`: receipts are a heavier, replaceable artifact (uploads can be re-done if rejected, cancelled, or replaced); having them as their own row gives clean cascade-on-delete semantics, audit history if we ever add it, and a place to track upload metadata without polluting the selection row.

---

## Schema Changes

### `Phase` model — additions

```prisma
model Phase {
  // ... existing fields preserved ...

  selectionMode          PhaseSelectionMode @default(NONE)
  maxSelections          Int                @default(1)
  allowChangeAfterSubmit Boolean            @default(false)
  requiresReceiptUpload  Boolean            @default(false) // phase-level default;
                                                            // overridable per-option (see PhaseOption.requiresReceipt)

  options     PhaseOption[]
  selections  AttendeeSelection[]
}

enum PhaseSelectionMode {
  NONE              // No options panel — phase behaves as it does today.
  ADMIN_ASSIGNED    // Admin picks for everyone. Attendees see read-only.
  ATTENDEE_PICKS    // Attendees pick for themselves.
  MIXED             // Admin can pre-assign some; rest pick.
  EXTERNAL_BOOKING  // Options are info-only; attendees book externally and upload receipt.
}
```

### `PhaseOption` — new

```prisma
model PhaseOption {
  id              String   @id @default(cuid())
  phaseId         String

  label           String
  labelAr         String?
  description     String?  @db.Text
  descriptionAr   String?  @db.Text
  externalUrl     String?         // booking link, info link
  capacity        Int?            // null = unlimited
  metadata        Json?           // free-form: { price, address, checkIn, ... }
  requiresReceipt Boolean? // null = inherit from Phase.requiresReceiptUpload;
                           //  true/false overrides for this specific option.

  order           Int      @default(0)
  isActive        Boolean  @default(true)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  phase           Phase    @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  selections      AttendeeSelection[]

  @@unique([phaseId, order])
  @@index([phaseId, isActive])
}
```

### `AttendeeSelection` — new

```prisma
model AttendeeSelection {
  id             String           @id @default(cuid())
  phaseId        String
  registrationId String
  optionId       String

  source         SelectionSource
  assignedBy     String?          // User.id of admin (for ADMIN_ASSIGNED) or null (for ATTENDEE_PICKED)
  assignedAt     DateTime         @default(now())
  notes          String?          // admin-only note (e.g., "Covered for VIPs")

  receiptFileId  String?          @unique // 0 or 1 receipt per selection

  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  phase          Phase            @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  registration   Registration     @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  option         PhaseOption      @relation(fields: [optionId], references: [id], onDelete: Cascade)
  receipt        PhaseReceipt?    @relation(fields: [receiptFileId], references: [id], onDelete: SetNull)

  // Prevents two rows for the same (phase, attendee, option) — i.e., picking
  // the same option twice. Multi-pick on a phase means N different options,
  // not N rows for the same option.
  @@unique([phaseId, registrationId, optionId])
  @@index([phaseId, optionId])
  @@index([registrationId])
}

enum SelectionSource {
  ADMIN_ASSIGNED
  ATTENDEE_PICKED
}
```

### `PhaseReceipt` — new

```prisma
model PhaseReceipt {
  id           String   @id @default(cuid())

  blobUrl      String           // Internal Vercel Blob URL (NOT directly browser-accessible
                                // because the store is Private). Read access requires a
                                // short-lived signed URL generated server-side. Never expose
                                // this raw URL in client responses — always sign first.
  blobPath     String           // Storage key/pathname inside the Blob store. Used for
                                // generating signed URLs and for delete operations.
  mimeType     String
  sizeBytes    Int
  originalName String           // for display ("flight-ticket.pdf")

  uploadedAt   DateTime @default(now())
  uploadedBy   String           // "registration:<id>" for attendee uploads,
                                // "admin:<userId>" if admin uploads on their behalf.

  selection    AttendeeSelection?

  @@index([uploadedAt])
}
```

### `Registration` — add relation

```prisma
model Registration {
  // ... existing ...
  selections  AttendeeSelection[]
}
```

---

## Storage: Vercel Blob (Private mode)

Receipt uploads are stored in [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) configured as a **Private** store. Private mode means uploaded files are not accessible by raw URL — every read requires a short-lived signed URL generated server-side. This is the right choice for receipts: they are personal financial documents that should not be readable by anyone who happens to know or guess the URL.

Why Vercel Blob over Supabase Storage: the app already runs on Vercel, no new credentials or service to monitor, native Next.js integration, and pricing is negligible at this scale (~200 KB per receipt × thousands of receipts ≈ single-digit USD/year).

### Setup (already done)

1. Vercel Blob store created in the Frankfurt (FRA1) region with **Private** access.
2. Connected to the project across Development / Preview / Production.
3. `BLOB_READ_WRITE_TOKEN` is auto-injected on Vercel and pulled to local `.env.local` via `vercel env pull`.
4. Install package in the repo: `npm install @vercel/blob`.

### Three flows: upload, read, delete

**Upload (attendee → Blob):**

The attendee's browser uploads directly to Vercel Blob using a one-shot upload token issued by our API. This avoids streaming a large file through Next.js. Pattern from `@vercel/blob/client`:

```ts
// Server route: POST /api/portal/[eventSlug]/receipts/upload
// Returns a one-shot upload token scoped to a specific path.
import { handleUpload } from '@vercel/blob/client';

export async function POST(req: NextRequest, { params }) {
  // 1. Auth: verify portal session for this event/registration.
  // 2. Verify the target selection exists, belongs to this attendee, phase
  //    is OPEN, requires receipt, and no receipt already uploaded
  //    (or replacement is permitted via allowChangeAfterSubmit).
  return handleUpload({
    body: await req.json(),
    request: req,
    onBeforeGenerateToken: async (pathname) => ({
      // Force a deterministic pathname; ignore client-provided one to
      // prevent path traversal attacks.
      allowedContentTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB
      addRandomSuffix: true,                // adds entropy to filename
      tokenPayload: JSON.stringify({ selectionId, registrationId, eventId }),
    }),
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      // Persist PhaseReceipt + link to AttendeeSelection.
      // blob.pathname is the canonical storage key — use it for blobPath.
      // blob.url is the internal URL (NOT directly accessible to browsers
      // since the store is private) — store it for reference but never
      // expose it raw to the client.
      const { selectionId, registrationId } = JSON.parse(tokenPayload);
      // ... create PhaseReceipt, update AttendeeSelection.receiptFileId
    },
  });
}
```

**Read (admin or attendee → signed URL → Blob):**

Because the store is Private, raw URLs are not readable. To let an admin or the uploading attendee view a receipt, the API generates a short-lived signed URL and returns that to the client. The client uses the signed URL directly (in an `<a href>` or `<iframe>`) and the URL expires after a few minutes.

```ts
// Server: GET /api/events/[eventId]/receipts/[receiptId]/signed-url
// (admin route; analogous attendee route at /api/portal/...)
import { head } from '@vercel/blob';

export async function GET(req: NextRequest, { params }) {
  // 1. Auth: admin must be a member of this event (admin route)
  //    OR portal session must match the receipt's registrationId (portal route).
  // 2. Look up PhaseReceipt by id; verify event ownership.
  // 3. Generate a signed URL from blobPath:
  const signed = await head(receipt.blobPath, {
    // The @vercel/blob SDK exposes a way to generate signed read URLs
    // for private blobs — exact helper depends on SDK version.
    // If a `getSignedUrl` helper is available, use it.
    // Otherwise the SDK's `head()` returns a downloadUrl that's signed.
  });

  return Response.json({
    url: signed.downloadUrl, // expires within a few minutes
    expiresAt: signed.downloadUrlExpiresAt,
    mimeType: receipt.mimeType,
    originalName: receipt.originalName,
  });
}
```

**Important:** the `@vercel/blob` SDK's exact API for signed read URLs evolves. At implementation time, Claude Code should:
1. Read the current `@vercel/blob` package docs (`npm view @vercel/blob` and the package README).
2. Use whichever helper the current version exposes for "get a signed read URL for a private blob" — this might be `getDownloadUrl()`, a property on `head()` results, or a dedicated helper.
3. Default signed URL TTL: 5 minutes. Long enough for the user to click a link in the same session, short enough that a leaked URL is dead before it can be misused.

**Delete (server-only):**

Receipts are deleted from Blob when:
- The attendee replaces their receipt (old file goes, new file comes in).
- The attendee changes their selection (and `allowChangeAfterSubmit` is on).
- The owning `AttendeeSelection` is deleted (cascade).
- The nightly orphan cleanup catches stragglers.

```ts
import { del } from '@vercel/blob';
await del(receipt.blobPath);
```

### File constraints

- **Allowed types:** `image/jpeg`, `image/png`, `application/pdf`. Enforced both client-side (selector accept attribute) and server-side (`onBeforeGenerateToken.allowedContentTypes`).
- **Max size:** 10 MB. Enforced both client-side and server-side. Vercel Blob also enforces.
- **Path scheme:** `events/<eventId>/receipts/<registrationId>/<selectionId>-<timestamp><ext>` (the SDK's `addRandomSuffix: true` appends extra entropy automatically). Predictable, scoped, easy to bulk-delete on event teardown.
- **No file from client:** the server constructs the pathname based on the authenticated user and the target selection. Never accept a client-supplied path.

### Privacy implications of Private mode

- API responses to the client **never** contain `blobUrl` or `blobPath`. They contain a `receiptId` and a separate signed-URL endpoint the client calls when it actually needs to display the file.
- Signed URLs are time-limited (~5 min default). Leaked URLs in screenshots / chat logs / browser history go dead quickly.
- Admin CSV exports list "receipt: yes/no" — they do **not** embed signed URLs (which would be stale by the time the CSV is opened anyway). To download a specific receipt, admin clicks the row in the UI and gets a fresh signed URL.
- The Blob store dashboard in Vercel itself can list and download files, but only authenticated team members of the Vercel project. This is fine.

### Replacement / deletion lifecycle

- If `allowChangeAfterSubmit` is on and the attendee changes their selection, the old `PhaseReceipt` row's blob is deleted via `del()` and the row is removed.
- When an `AttendeeSelection` row is deleted (cascade from phase or option delete), the linked `PhaseReceipt` row is preserved (`onDelete: SetNull` on the FK) but orphaned. The Stage 5 nightly cleanup job deletes orphans from Blob and from the table.

---

## Behavior Specifications

### Selection Mode Semantics

| Mode | Admin can pre-assign? | Attendee can pick? | Receipt prompt? |
|---|---|---|---|
| `NONE` | No options panel at all. | — | — |
| `ADMIN_ASSIGNED` | Required. Admin must assign before phase becomes "OPEN" for that attendee. | No. | Per-option override (rare in this mode). |
| `ATTENDEE_PICKS` | Optional, treated as a pre-fill the attendee can change (if `allowChangeAfterSubmit`). | Yes, mandatory. | Per-option (e.g., "self-arrange" requires receipt). |
| `MIXED` | Optional. Pre-assigned attendees see read-only. | Yes, if not pre-assigned. | Per-option. |
| `EXTERNAL_BOOKING` | Disabled — there's nothing to "assign" since the system doesn't book. | No (options are informational). | Always required. The "pick" is implicit when the receipt is uploaded against an option. |

### Capacity Enforcement

- Capacity is a hint for attendee picks. When attendee submits a selection:
  ```sql
  BEGIN TRANSACTION;
  SELECT capacity, (SELECT COUNT(*) FROM AttendeeSelection WHERE optionId = X) AS taken
    FROM PhaseOption WHERE id = X FOR UPDATE;
  -- If taken >= capacity: raise "Option is full"
  INSERT INTO AttendeeSelection ...;
  COMMIT;
  ```
  Postgres row lock prevents two concurrent submissions both succeeding when capacity is 1.
- Admin force-assignment **bypasses the capacity check** but writes a warning into the response: `{ overCapacity: true, currentTaken: 31, capacity: 30 }`. Admin UI shows confirmation dialog before writing. Resulting state is allowed; over-capacity badge appears on the option.
- `null` capacity means unlimited — no check performed.

### Admin Pre-Assignment Flow

Admin opens **Dashboard → Attendees → click attendee → Selections tab.** The tab lists every option-bearing phase for the event with that attendee's current state.

For each phase, admin can:
- See the current selection(s) — option label, source (admin/attendee), assignedBy + when, notes.
- For `ADMIN_ASSIGNED` and `MIXED`: change assignment via a dropdown (option list with capacity counts) → click Save. Audit fields (`assignedBy = current user`, `assignedAt = now`, `notes`) get written.
- For `ATTENDEE_PICKS` and `EXTERNAL_BOOKING`: admin can also "pick on their behalf" if the attendee hasn't selected yet — same UI; written with `source = ADMIN_ASSIGNED`. (This is the "we did this for them" case.)
- Clear an assignment (sets nothing — phase falls back to "pending" for `ATTENDEE_PICKS`/`MIXED`, "not assigned" for `ADMIN_ASSIGNED`).

When admin force-assigns past capacity, a confirmation dialog: *"This option is at capacity (30/30). Assigning will put it at 31/30. Continue?"* with **Cancel** and **Assign anyway**. After confirm, the row is written.

### Attendee Picking Flow (Portal)

Portal phase fill page (`/portal/[eventSlug]/phases/[phaseId]`) currently renders a stepper for regular fields. With options:

- **At the top of the phase page** (above any regular fields): an **Options** card showing:
  - Phase title and description (existing).
  - For `ADMIN_ASSIGNED`: read-only display of the assigned option, including description and metadata. If admin hasn't assigned yet, show "Pending assignment from organizer."
  - For `ATTENDEE_PICKS` / `MIXED` (when not pre-assigned): grid of option cards. Each card shows label, description, capacity-remaining badge ("5 of 30 left" / "Full" / no badge for unlimited), external link if any. Clicking selects (single-pick) or toggles (multi-pick up to `maxSelections`).
  - For `EXTERNAL_BOOKING`: list of options as info cards with prominent "Book" link. Below: a single file upload control to attach the receipt. Selecting an option in this mode happens at upload time — attendee picks which option from a dropdown when they upload.

- **Below the options card**, regular FormField inputs render as today (stepper if multi-step). The Submit at the end of the form persists both the option selection(s) and the field answers in one transaction.

- **Capacity races:** if attendee submits against an option that filled up between page load and submit, server returns 409 Conflict with `{ error: "Option is full", optionId: "..." }`. Client refetches options, shows the option as Full, and asks attendee to choose again.

- **Receipt upload:**
  - When the chosen option requires receipt (`option.requiresReceipt = true`, or null with phase-level `requiresReceiptUpload = true`): an upload control appears after selection.
  - Upload uses Vercel Blob client SDK direct-to-storage flow.
  - Upload progress shown. On success, file is linked to the selection and phase status flips to "Completed."
  - Replace: if `allowChangeAfterSubmit` is on and a receipt already exists, attendee can replace it. Old file is deleted from Blob.

### Phase Status with Selections

The existing phase status logic (`computePhaseStatus`) returns one of: `LOCKED`, `NOT_OPEN`, `OPEN`, `CLOSED`. With selections, we add a per-attendee **completion** dimension:

```
type PhaseCompletionStatus =
  | "NOT_STARTED"          // No selection, no submission, no receipt.
  | "PARTIALLY_COMPLETE"   // Selection made but receipt required & missing.
  | "COMPLETE"             // All required selections + receipts + fields done.
  | "PENDING_ASSIGNMENT"   // ADMIN_ASSIGNED phase, no admin assignment yet.
```

- A phase is `COMPLETE` for an attendee when:
  - The required number of selections is made (`maxSelections` for required phases; or `>= 1` for non-required).
  - For each selection where receipt is required: receipt is uploaded.
  - All required FormField answers are submitted (existing rule).
- The completion status is surfaced in the portal as a phase-card badge and on the admin stats page as the "submitted" / "not submitted" categorization (which now expands to four buckets).

### Change-After-Submit

Per-phase toggle. Default off — once an attendee submits, the selection is locked.

When on:
- Attendee can change their selection until `closesAt` (or LOCKED override).
- Capacity is rechecked at change time. If the new option is full, the change is rejected.
- The old selection row is deleted; new one written. Receipt (if any) is deleted from Blob and unlinked.
- Admin can always change regardless of this flag (admin override is independent).

### Audit Trail

- `AttendeeSelection.assignedBy` records which admin did the assignment (or null for self-pick).
- `AttendeeSelection.assignedAt` is the most recent assignment timestamp.
- `AttendeeSelection.notes` is admin-editable free text.
- For changes: we don't keep history of previous selections in v1. The old row is replaced. Add a separate `SelectionAuditLog` table in v2 if needed.

### Module Gating

The Options feature is gated by the existing `postRegPhases` module flag. No new module needed — selection capability is part of the post-reg phase feature. If `postRegPhases` is off, the new Options panel doesn't appear in the form-builder, and the API endpoints reject calls.

---

## Admin UX

### Form-Builder Page — Phase Settings (existing card, additions)

The phase settings card already shows opensAt/closesAt/title/etc. For post-reg phases, add a **collapsed-by-default "Options" panel** below the existing settings:

- **Toggle:** "Use options for this phase" (sets `selectionMode != NONE`).
- When enabled, expand to show:
  - **Selection mode** dropdown: ADMIN_ASSIGNED / ATTENDEE_PICKS / MIXED / EXTERNAL_BOOKING.
  - **Max selections** input (default 1; only shown for ATTENDEE_PICKS/MIXED).
  - **Allow change after submit** toggle.
  - **Require receipt upload** toggle (phase-level default; per-option override exists in option editor).
  - **Options list** with add/edit/reorder/delete:
    - Each option row: label, label_ar, description (collapsed), externalUrl (collapsed), capacity, requiresReceipt (override), metadata (key-value editor, collapsed).
    - Reorder via up/down arrows (matches existing pattern).
    - Delete guarded: cannot delete an option that has any `AttendeeSelection` rows. Show "X attendees selected this — reassign first" with a button that opens a bulk-reassignment helper (a dropdown of other options for this phase).

### Attendee Detail Page — Selections Tab (new)

URL: same page, new tab. `src/app/(dashboard)/dashboard/events/[eventId]/attendees/[contactId]/page.tsx`.

Lists all phases for the event where `selectionMode != NONE`. For each phase:
- Phase title, mode badge.
- Current selection(s):
  - Option label
  - Source pill (Admin-assigned / Attendee-picked)
  - Receipt status (Uploaded · view link / Required / Not required)
  - Audit line: "Assigned by Mohanad · 2 days ago · 'Covered for VIPs'"
- Action area:
  - For ADMIN_ASSIGNED / MIXED: dropdown of options (with capacity counts), Save button, optional notes input.
  - For ATTENDEE_PICKS: "Pick on their behalf" button → same dropdown (writes as `ADMIN_ASSIGNED` source).
  - "Clear" link.

### Statistics Page — Per-Option Section (new)

`src/app/(dashboard)/dashboard/events/[eventId]/statistics/page.tsx`.

Below the existing per-phase completion cards, when a phase has `selectionMode != NONE`:
- For each option in the phase:
  - Option label and capacity bar ("12 / 30" or "12 / ∞").
  - Count of attendees who picked it. Over-capacity rows shown in red ("31 / 30").
  - Receipt completion sub-count if applicable ("8 of 12 receipts uploaded").
  - Click expands the row to a list of attendees with names + emails + optional CSV export ("Download as CSV").
- Filter the existing attendees-list page by `?phase=<id>&option=<id>` for transport planning.

---

## API Endpoints

### Admin (under `/api/events/[eventId]/`)

```
GET    /phases/[phaseId]/options                    List options for a phase
POST   /phases/[phaseId]/options                    Create an option
PATCH  /phases/[phaseId]/options/[optionId]         Update option
DELETE /phases/[phaseId]/options/[optionId]         Delete (guarded)
POST   /phases/[phaseId]/options/reorder            Reorder options

PATCH  /phases/[phaseId]                            (existing) — accepts new
                                                     selectionMode, maxSelections,
                                                     allowChangeAfterSubmit,
                                                     requiresReceiptUpload fields.

GET    /contacts/[contactId]/selections             List this attendee's
                                                     selections across all phases.
PUT    /contacts/[contactId]/selections             Set/replace a selection
                                                     for this attendee (admin
                                                     pre-assignment). Body:
                                                     { phaseId, optionIds[], notes,
                                                       force? }
DELETE /contacts/[contactId]/selections/[selId]     Clear a selection

GET    /phases/[phaseId]/selections                 All selections on this phase
                                                     (admin overview / CSV).
                                                     Supports ?optionId= filter.
```

### Attendee (under `/api/portal/[eventSlug]/`)

```
GET    /phases/[phaseId]                            (existing) — response now
                                                     includes options[], selections[],
                                                     and computed completion status.

PUT    /phases/[phaseId]/selections                 Submit / replace attendee's
                                                     selection(s). Body:
                                                     { optionIds[] }.
                                                     Server enforces capacity,
                                                     mode, maxSelections,
                                                     allowChangeAfterSubmit.

POST   /phases/[phaseId]/selections/[selId]/receipt
                                                     Returns one-shot Vercel Blob
                                                     upload token (handled by
                                                     @vercel/blob/client).

GET    /phases/[phaseId]/selections/[selId]/receipt/signed-url
                                                     Returns a short-lived signed URL
                                                     to view the receipt the attendee
                                                     uploaded. ~5 min TTL.

DELETE /phases/[phaseId]/selections/[selId]/receipt
                                                     Delete uploaded receipt
                                                     (only if change-after-submit
                                                     is on).
```

### Admin signed-URL access (additional)

```
GET    /api/events/[eventId]/receipts/[receiptId]/signed-url
                                                     Admin-only signed URL to view
                                                     a receipt. ~5 min TTL.
                                                     Used from the attendee detail
                                                     page when admin clicks "View
                                                     receipt."
```

### Validation rules

- Capacity check on PUT selections (transactional row lock).
- `optionIds.length <= phase.maxSelections`.
- All `optionIds` must belong to the phase (no cross-phase write).
- Phase must be OPEN (computed status, including `PhaseAccess` overrides) for attendee writes. Admin writes ignore this.
- Receipt upload only allowed when option requires receipt and no receipt exists (or `allowChangeAfterSubmit` is on).
- Over-capacity admin writes require `force: true` in body — without it, server returns 409.

---

## Implementation Stages

Each stage is a mergeable chunk. Verified on staging before the next starts.

### Stage 1 — Schema + storage setup

- Add `selectionMode`, `maxSelections`, `allowChangeAfterSubmit`, `requiresReceiptUpload` to `Phase`.
- Add `PhaseOption`, `AttendeeSelection`, `PhaseReceipt`, `SelectionSource` enum, `PhaseSelectionMode` enum.
- Update `Registration` to include `selections` relation.
- Vercel Blob store is already created (Private, FRA1, connected to all environments). Token is in `.env.local`.
- Install `@vercel/blob` package.
- Create a small `src/lib/blob.ts` wrapper with three functions: `generateUploadToken`, `getSignedReadUrl`, `deleteBlob`.
- **Smoke test:** before declaring Stage 1 done, write a tiny throwaway script (or admin-only test endpoint) that uploads a small file via `put()`, fetches a signed read URL, opens it in a browser, downloads it, then deletes it via `del()`. This confirms the SDK's API matches what the spec assumes. If the smoke test reveals the SDK uses different helper names or signatures, document the deltas before Stage 4 starts.
- Run migration on staging. Verify all existing post-reg phases load with `selectionMode = NONE` and behave identically to today.
- **Deliverable:** schema in place, storage configured, signed-URL flow proven on a smoke test, no UI changes yet, no behavior change for existing phases.

### Stage 2 — Admin: options CRUD + form-builder UI

- API routes for option CRUD + reorder.
- Phase settings card on the form-builder page gains the "Options" panel (collapsed by default, expand on toggle).
- Selection mode, max selections, allow-change, require-receipt toggles wire to `Phase` updates.
- Option list with add/edit/reorder/delete. Delete guard surfaced (with "X attendees selected this" hint when blocked).
- No attendee-side rendering yet; admin can configure but selections can't be made.
- **Deliverable:** admin can fully define options on a phase. Save/load works. Capacity, metadata, external link, receipt-override all editable.

### Stage 3 — Attendee picking + capacity enforcement

- Portal phase page renders the Options card above regular fields (mode-dependent).
- PUT selections endpoint with transactional capacity check.
- Capacity-remaining badge on each option card (computed at page load — not live).
- Multi-pick UI when `maxSelections > 1`.
- Change-after-submit enforced.
- 409 race-condition handling on capacity full.
- **Deliverable:** attendees can pick options end-to-end for ATTENDEE_PICKS and MIXED modes. ADMIN_ASSIGNED renders read-only "pending assignment" or assignment display. EXTERNAL_BOOKING shows the info-only list (without upload yet — that's Stage 4).

### Stage 4 — Receipt upload (Private blob + signed URLs)

- `src/lib/blob.ts` finalised:
  - `generateUploadToken(...)` — wraps `handleUpload` from `@vercel/blob/client`.
  - `getSignedReadUrl(blobPath)` — returns a short-lived signed URL using the current `@vercel/blob` SDK helper (Claude Code: read the package docs at implementation time and use the current API; default TTL 5 minutes).
  - `deleteBlob(blobPath)` — wraps `del()`.
- POST `/portal/.../receipt` token endpoint, `onUploadCompleted` callback writes `PhaseReceipt` and links to `AttendeeSelection` (uses `blob.pathname` as `blobPath`, never trusts client-supplied paths).
- GET `/portal/.../receipt/signed-url` returns signed URL to attendee.
- GET `/api/events/[eventId]/receipts/[receiptId]/signed-url` returns signed URL to admin (used from Selections tab).
- Portal: receipt upload control appears after selection on options that require receipt. After upload, "View" link calls signed-URL endpoint and opens the result.
- Replace receipt flow (when `allowChangeAfterSubmit`).
- DELETE receipt endpoint deletes blob via `del()` then removes row.
- Phase status calculation now considers receipt presence for completion.
- EXTERNAL_BOOKING mode wired: pick-via-receipt flow works.
- API responses **never** expose `blobUrl` or `blobPath` to clients — only `receiptId`, `originalName`, `mimeType`, `sizeBytes`, `uploadedAt`.
- **Deliverable:** end-to-end upload-prove-it flow with private storage. Admin sees uploaded receipts on the attendee detail page (Stage 5 wires the UI button; the API endpoint exists from Stage 4).

### Stage 5 — Admin: per-attendee assignment + stats + cleanup

- **Selections tab** on the attendee detail page. List all option-bearing phases, current state, change/clear actions, force-capacity dialog.
- API: `PUT /contacts/[contactId]/selections` with `force` flag for over-capacity.
- **Statistics page:** per-option counts, capacity bars, receipt sub-counts, attendee-list expand, CSV export.
- **Attendee list filter:** `?phase=X&option=Y` filter on the existing attendees page (for "show me everyone in Hotel A").
- **Orphan cleanup job:** a small cron entry (extend `vercel.json`) that runs nightly and deletes orphaned `PhaseReceipt` rows (no linked selection) older than 24 hours. Removes the file from Blob and the row from DB.
- **Deliverable:** full admin loop. Pre-assignment, transport planning, cleanup. Feature is complete.

---

## Quality Disciplines

### Reuse the existing staging pattern

- Migration runs on staging first (single Prisma migration, no multi-pass needed since `selectionMode` defaults to `NONE`).
- The Stage 1 test event harness already on staging gains a "Hotel" phase (MIXED mode, 3 options, capacity, receipt-required on one option) and a "Workshop tracks" phase (ATTENDEE_PICKS, multi-pick, no capacity, no receipt) for full-flow QA.

### Concurrency

- Capacity write **must** use `SELECT ... FOR UPDATE` inside a Prisma `$transaction`. Spec this explicitly in Stage 3 PR description so it's not silently dropped.
- Admin force-assignment skips the lock since over-capacity is the intended state.

### Vercel Blob hygiene

- The Blob store is configured as **Private**. Raw URLs are not directly browser-accessible. All read access goes through signed URLs generated server-side.
- Every `PhaseReceipt` row must have a corresponding Blob object — and vice versa. The Stage 5 cleanup job is the safety net.
- On `AttendeeSelection` delete (cascade or manual): delete the receipt Blob synchronously via `del()`. If Blob delete fails, log it but don't block the DB delete — orphans get caught by the nightly job.
- Never trust `originalName` for storage keying — sanitize and use the structured path scheme. The SDK's `addRandomSuffix: true` adds entropy automatically; rely on it instead of hand-rolling random suffixes.
- Never expose `blobUrl` or `blobPath` in API responses to clients. Always return a `receiptId`; clients call the signed-URL endpoint when they need to display the file.
- Signed URLs default to 5-minute TTL. Don't cache them client-side; refetch on each view.
- Read the current `@vercel/blob` package docs at implementation time. The SDK's API for signed read URLs has changed across versions — use whichever helper the version on `npm` exposes. If the docs are unclear, run a quick smoke test in Stage 1 to confirm the read flow works end-to-end before investing in Stage 4.

### Privacy

- Public option queries (called from portal) **must not** return capacity-fill counts that reveal who picked what. Show "5 of 30 left" or "Full" — never names.
- Admin-only endpoints can return attendee lists per option; portal endpoints cannot.
- Receipt URLs are scoped per attendee — only the uploading attendee and event admins can see the URL. Don't leak it in stats CSVs except to admins.

### Bilingual content

- `PhaseOption.label` + `labelAr` + `description` + `descriptionAr` follow the same pattern as `FormStep`.
- Portal renders Arabic labels when `multiLanguage` module is on, in RTL.

### Migration safety

- All new fields on `Phase` have safe defaults (`NONE`, `1`, `false`). Existing rows unaffected.
- All new tables have no FK constraints into existing tables that would fail on legacy data.
- The migration is a single Prisma migration. No multi-pass.

---

## Acceptance Criteria

### Stage-level

**Stage 1:**
- [ ] Migration runs cleanly on staging, no existing phase changes behavior.
- [ ] Smoke test passes: upload a small file, fetch a signed read URL, view in browser, delete via SDK. Documented if SDK API names differ from this spec.
- [ ] `selectionMode = NONE` is the default for every existing and new phase.

**Stage 2:**
- [ ] Admin can configure all four selection modes on a phase.
- [ ] Add/edit/reorder/delete options works. Delete guard fires when option has selections.
- [ ] Per-option `requiresReceipt` override works (null = inherit).
- [ ] Metadata key-value editor saves/loads JSON correctly.
- [ ] Bilingual fields supported.

**Stage 3:**
- [ ] ATTENDEE_PICKS phase: attendee picks an option, submission persists.
- [ ] MIXED phase: pre-assigned attendees see read-only; others can pick.
- [ ] Capacity enforced under concurrent submissions (verified with a stress script).
- [ ] 409 returned when attendee tries to pick a now-full option; client recovers gracefully.
- [ ] `maxSelections > 1` allows multi-pick up to limit.
- [ ] `allowChangeAfterSubmit = false` rejects re-submission attempts; `= true` allows.

**Stage 4:**
- [ ] Receipt upload to Vercel Blob from portal works (Private mode).
- [ ] On successful upload, `PhaseReceipt` row created and linked to selection.
- [ ] `blobUrl` and `blobPath` never appear in any API response to a client.
- [ ] Attendee can view their own receipt via signed-URL endpoint.
- [ ] Admin can view any receipt for their event via signed-URL endpoint.
- [ ] Signed URLs expire within ~5 minutes.
- [ ] EXTERNAL_BOOKING mode: pick + upload completes the phase.
- [ ] Replace receipt deletes old Blob object via `del()`.
- [ ] Phase status correctly computes COMPLETE only when receipt is present where required.

**Stage 5:**
- [ ] Selections tab on attendee detail page lists all option-bearing phases.
- [ ] Admin can assign / change / clear selections.
- [ ] Force-capacity dialog appears and admin can assign past capacity.
- [ ] Statistics page shows per-option counts, capacity, receipt completion.
- [ ] CSV export works ("Hotel A: 12 attendees" → CSV with names + emails + phones).
- [ ] Attendee-list filter `?phase=X&option=Y` works.
- [ ] Nightly orphan cleanup job runs and deletes truly orphaned receipts.

### Whole-feature

- [ ] All 5 stages deployed and verified on staging.
- [ ] Test event harness extended with hotel + workshops phases passes end-to-end.
- [ ] No regression on existing post-reg phases without options (`selectionMode = NONE`).
- [ ] `postRegPhases` module flag correctly gates option-related UI and APIs.
- [ ] Bilingual rendering correct.
- [ ] Privacy: attendees never see other attendees' selections.
- [ ] Admin audit trail (`assignedBy`, `assignedAt`, `notes`) captured.

---

## Open Questions

1. **Replace-receipt UX.** When `allowChangeAfterSubmit` is on and attendee uploads a new receipt over an existing one — confirm dialog or silent replace? Default: confirm dialog ("This will replace your existing receipt. Continue?").
2. **Empty option metadata.** When `metadata = null`, does the portal render a stub area or nothing? Default: nothing.
3. **Option deactivation vs. delete.** `PhaseOption.isActive = false` hides the option from new picks but preserves existing selections. Should admin UI offer "deactivate" as the primary action and "delete" as the destructive one? Default: yes — deactivate is the soft-delete; delete is rarer and guarded.
4. **Capacity badge visibility threshold.** Always show "5 of 30 left," or only when remaining ≤ 20% (to create urgency)? Default: always show the count when capacity is set.
5. **Notes visibility.** Admin notes on a selection are admin-only — never shown to the attendee. Confirm. Default: admin-only.

---

## Notes for Claude Code

- This is a single-migration feature. Do not multi-pass the schema like the Phase / Step / FormField rollout.
- Reuse `authorizeEvent({ module: "postRegPhases" })` on every new admin route. Reuse `getPortalSessionFromRequest` on every portal route.
- Reuse the existing reorder pattern (`@@unique([phaseId, order])` + three-step swap with `TEMP = -1`) for option reordering — same pattern is in `phase.service.ts`.
- The Vercel Blob client SDK does the heavy lifting for uploads; do not build a chunked-upload pipeline by hand.
- `$transaction` with `SELECT ... FOR UPDATE` for capacity — use Prisma's interactive transactions (`prisma.$transaction(async (tx) => { ... })`) and `tx.$queryRaw` for the lock query.
- Keep services in `src/lib/services/`. Add `selection.service.ts` and `receipt.service.ts`. Don't bloat `phase.service.ts`.
- Add a Zod schema set in `src/lib/validations/selection.ts` covering every endpoint payload.
- Do not modify the `PhaseSubmission` flow for regular fields. Selections live in their own table.
- Do not add tests unless explicitly asked.
- One commit per sub-deliverable within each stage. Push each stage as a separate PR.
- Sketch the Selections tab UX (attendee detail page) and the Options panel UX (form-builder phase settings) as visual mockups before coding Stage 2 and Stage 5. Same discipline as the previous spec.

---

*Approved for implementation. Stage 1 is unblocked once the previous (Phase / Step / FormField) feature is verified stable in production.*
