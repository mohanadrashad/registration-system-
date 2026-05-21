# FILE Field Type — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation as a 3-stage feature.
**Prerequisites:** All previous features deployed and stable in production. Vercel Blob is already provisioned (Private mode, FRA1 region) from the Phase Selections work — the same infrastructure is reused here.

---

## Overview

The `FILE` field type exists in the `FieldType` enum and appears in the form-builder's Type dropdown today. But the public registration page renderer has no `FILE` branch — visitors see only the field's label and required asterisk, no upload control. The field is effectively broken: admins can configure it, but no attendee can submit a file.

This spec closes the gap end-to-end. Visitors can upload one file per FILE field on the public registration page. The file lives in Vercel Blob (Private mode, signed URLs for read). Admins see uploaded files on the attendee detail page with download links. The upload happens before form submission, using a session-cookie-based auth model since the public registration page is unauthenticated.

The same architectural pattern is then available for future surfaces (admin-side file fields, portal-side FILE fields on post-registration phases) but those are out of scope here.

---

## Goals

- A `FILE` field on a public registration form renders a working upload control.
- The visitor picks a file, sees upload progress, and can replace it before submitting.
- The file uploads directly to Vercel Blob, not through our API server (avoids body-size limits, scales naturally).
- The file is associated with the visitor's registration on form submission.
- An admin can view the file from the attendee detail page via a short-lived signed URL.
- Files have per-field configuration: max size and allowed MIME types, set by the admin in the form-builder.
- Files for abandoned registrations (visitor uploaded but never submitted) are cleaned up nightly.
- Required FILE fields are validated server-side at submission time.
- All existing fields and behaviors continue working unchanged.

## Non-Goals

- Multiple files per FILE field. One file per field for v1. Admins who need "upload three documents" create three FILE fields. Revisit if real usage shows pain.
- Admin-side file upload (uploading on a visitor's behalf from the attendee detail page). Visible-only for v1.
- FILE fields on portal phase fill pages. Different auth model (portal sessions), different flow. Out of scope.
- Bulk download of all files for an event. Admin downloads per-attendee via the detail page. Add later if asked.
- File preview thumbnails in the admin UI. Filename + download link only for v1.
- File version history. Replacement deletes the old blob. No undo.
- Image resizing or compression. The file is stored as-uploaded.
- Drag-and-drop multi-file selection (since we only support one file per field).
- Resumable / chunked uploads. If a 10MB upload fails mid-stream, visitor retries from scratch.
- Email/badge template substitution of file URLs. We expose filenames only to email and badge contexts (security: signed URLs in email bodies become dead links by the time they're opened).

---

## Architecture

### Storage shape

A new `RegistrationFile` table, paralleling `PhaseReceipt`:

```prisma
model RegistrationFile {
  id              String   @id @default(cuid())

  // The registration this file belongs to. Nullable until form submission
  // finalizes the link — files exist on Blob before the Registration row
  // is created.
  registrationId  String?
  registration    Registration? @relation(fields: [registrationId], references: [id], onDelete: SetNull)

  // The FormField (specific field on a specific event). Used for validation
  // and to know which field this file answers.
  formFieldId     String
  formField       FormField @relation(fields: [formFieldId], references: [id], onDelete: Cascade)

  // Pre-submission, the upload session ID ties files to a visitor cookie.
  // After submission, registrationId is set and this becomes informational.
  uploadSessionId String

  // Vercel Blob references. Private mode — never expose blobUrl or blobPath
  // to clients raw.
  blobUrl      String
  blobPath     String   @unique
  mimeType     String
  sizeBytes    Int
  originalName String

  uploadedAt   DateTime @default(now())
  uploadedBy   String   // "session:<id>" pre-submission, "registration:<id>" after

  @@index([uploadSessionId])
  @@index([registrationId])
  @@index([formFieldId])
  @@index([uploadedAt])
}
```

A new table rather than reusing `PhaseReceipt`:
- `PhaseReceipt` has `selection AttendeeSelection?` relation that doesn't apply to registration files. Making it nullable for both use cases blurs semantics and complicates future feature work on either surface.
- `RegistrationFile` cascades from FormField — when an admin deletes a FORM field, its uploaded files are deleted too.
- Keeping the tables separate means future PRs touching one don't risk the other.

### `Registration.formData` shape for FILE fields

`formData[fieldName]` stores a denormalized reference, not just the file ID:

```json
{
  "first_name": "Mohanad",
  "commercial_registration": {
    "fileId": "clxx12345abc",
    "filename": "CR_2026.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 482103
  }
}
```

The denormalization (filename, mimeType, sizeBytes alongside fileId) lets admin display surfaces render without an extra DB query per file per row. The DB of record is `RegistrationFile`; `formData` is the read-optimized cache.

### `FormField.metadata` — per-field FILE configuration

`FormField.metadata` is already a `Json?` column. For FILE fields, it carries:

```ts
type FileFieldMetadata = {
  maxSizeMB: number;          // default 10
  allowedMimeTypes: string[]; // default ["image/jpeg", "image/png", "application/pdf"]
};
```

Other field types use `metadata` for their own keys; this is purely additive. The admin UI only renders these settings when type is FILE.

### Upload auth — the architectural call

Public registration is unauthenticated. We can't tie uploads to a user session. Instead:

**Pattern: session-cookie-bound upload tokens.**

1. **First page load.** The GET handler for `/register/[eventSlug]` sets an HttpOnly cookie `reg_upload_session` containing a signed UUID (signed with `AUTH_SECRET`, 24-hour expiry, `SameSite=Strict`). If the cookie already exists, reuse it.

2. **Upload token request.** When the visitor selects a file, the client calls `POST /api/register/[eventSlug]/upload-token` with `{ formFieldId, filename, mimeType, sizeBytes }`. The server:
   - Reads `reg_upload_session` cookie. Validates signature.
   - Confirms formField exists on this event, type is FILE, and the file metadata is within the field's configured limits.
   - Calls Vercel Blob's `handleUpload` which mints a short-lived (10-minute) client upload token. The token's payload encodes `{ eventSlug, formFieldId, uploadSessionId }`.
   - Returns the token to the client.

3. **Direct-to-blob upload.** The client uses `@vercel/blob/client`'s `upload()` function with the token. The visitor's browser uploads directly to Vercel Blob — our server never sees the file bytes.

4. **`onUploadCompleted` webhook.** Vercel calls our `POST /api/register/[eventSlug]/upload-completed` after the blob upload succeeds, with the token payload + blob URL + path. Server:
   - Verifies the token payload.
   - Creates a `RegistrationFile` row with `registrationId = null`, the session ID from the token, and the blob references.
   - Returns the new `fileId` so the client can store it.

5. **Form submission.** The POST to `/api/register/[eventSlug]` includes the `fileId` for each FILE field. Server:
   - For each fileId: validates the row exists, its `uploadSessionId` matches the request cookie, the field belongs to this event, no other registration already claims this file.
   - Updates the `RegistrationFile.registrationId` to the new registration.
   - Writes the denormalized `{ fileId, filename, mimeType, sizeBytes }` into `Registration.formData[fieldName]`.

6. **Replacement before submission.** If visitor uploads a new file for a field that already has one in this session:
   - Client calls `DELETE /api/register/[eventSlug]/files/[fileId]`.
   - Server validates session cookie matches the file's session ID.
   - Server deletes the blob via `del()` and the row.
   - Client then initiates the new upload from scratch.

7. **Reading the file (admin).** From the attendee detail page, admin clicks the file link, which opens `GET /api/events/[eventId]/files/[fileId]/stream` in a new tab. The server re-validates `authorizeEvent` per request, fetches the blob via `streamPrivateBlob(blobPath)`, and pipes the bytes back with the original content-type and a `Content-Disposition` matching the stored filename. There is no URL the client retains — access is gated by the admin's live session on every request, and revoking the admin's session immediately invalidates further reads.

### Orphan cleanup

A new background task (piggybacking on the existing nightly orphan-receipt cleanup at 03:30 UTC):

```
DELETE from RegistrationFile WHERE registrationId IS NULL AND uploadedAt < NOW() - INTERVAL '24 hours'
```

For each deleted row, also delete the blob via `del(blobPath)`. Same defensive pattern as `PhaseReceipt` cleanup — blob delete failures are logged but don't block DB deletion (the blob becomes a Vercel storage orphan; periodic Blob-side cleanup catches those).

### File size and type validation — three layers

1. **Client-side.** File picker `accept` attribute matches `metadata.allowedMimeTypes`. Size check on `<input>` change before initiating upload.
2. **Vercel Blob (`handleUpload`).** `onBeforeGenerateToken` callback receives `allowedContentTypes` and `maximumSizeInBytes`. Blob enforces these server-side before accepting the upload.
3. **`onUploadCompleted`.** Re-validates `mimeType` and `sizeBytes` against the field's metadata. Defense-in-depth.

### Admin read path: stream-through, not signed URLs

`@vercel/blob` v2.3.3 does not expose a `getSignedReadUrl` helper or a TTL-bound download URL for private blobs. `getDownloadUrl(blobUrl)` only appends `?download=1` to an existing URL — it does not sign or set an expiry. For private blobs, the URLs that `put` / `head` / `get` return still require authentication to fetch, so they can't be handed to a browser directly.

The canonical read path is therefore **stream-through**: the admin's "View" click hits an API route under `/api/events/[eventId]/files/[fileId]/stream`, the server re-validates `authorizeEvent` per request, calls `streamPrivateBlob(blobPath)` to fetch the bytes, and pipes them back with the original content-type and a `Content-Disposition` derived from the stored filename.

This matches the existing `PhaseReceipt` read pattern at `src/app/api/portal/[eventSlug]/receipts/[receiptId]/route.ts`. The privacy posture is strictly stronger than a signed URL with a TTL: there is no URL the client retains, no replay window, and revoking the admin's session immediately stops further reads. If the SDK ever ships a stable signed-URL helper, the route can be swapped out without changing the spec's API contract.

---

## Behavior Specifications

### Admin: configuring a FILE field

In the FormField Add/Edit dialog, when type is FILE, a new section appears below the existing "Display text" block:

```
─── File upload settings ─────────────────────────────────

  Maximum file size
  [10] MB  (range: 1-25)

  Allowed file types
  ☑ JPEG image (.jpg, .jpeg)
  ☑ PNG image (.png)
  ☑ PDF document (.pdf)
  ☐ Word document (.docx)
  ☐ Excel spreadsheet (.xlsx)
```

Defaults: 10MB, JPEG + PNG + PDF allowed.

For v1, the five types above cover most registration use cases. Adding more types later is a one-line change to a constants file.

When the field is required, the public renderer enforces upload before submission.

### Visitor: filling a FILE field

The public renderer's FILE branch:

**Empty state (no file selected):**
```
┌──────────────────────────────────────────────────────────┐
│ Commercial Registration *                                │
│                                                          │
│  ┌──────────────────────────────┐                       │
│  │  📎  Choose file              │                       │
│  └──────────────────────────────┘                       │
│  PDF, JPEG, or PNG, up to 10 MB                          │
└──────────────────────────────────────────────────────────┘
```

**Uploading state (after file selected):**
```
┌──────────────────────────────────────────────────────────┐
│ Commercial Registration *                                │
│                                                          │
│  📄 CR_2026.pdf  (482 KB)                                │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░  45%                            │
└──────────────────────────────────────────────────────────┘
```

**Uploaded state:**
```
┌──────────────────────────────────────────────────────────┐
│ Commercial Registration *                                │
│                                                          │
│  ✓ CR_2026.pdf  (482 KB)         [Replace]  [Remove]    │
└──────────────────────────────────────────────────────────┘
```

**Error states:**
- File too large: *"File is 12 MB. Maximum allowed is 10 MB."* (Or AR equivalent.)
- Wrong type: *"PDF, JPEG, or PNG only. You selected DOCX."*
- Upload failed: *"Upload failed. Please try again."*

Errors are inline below the picker. Clearing the error lets the visitor try again.

**Replacement.** Clicking [Replace] triggers a DELETE call for the existing file, then opens the file picker. The previous blob is gone before the new upload starts.

**Remove.** Clicking [Remove] (only present on uploaded state) deletes the file without replacement. Required field then fails validation if visitor submits without uploading a new one.

### Visitor: submitting the form

When the visitor clicks Submit:
- Client collects `fileId` for each FILE field (or `null` if none).
- Client sends the standard form payload, with FILE fields represented as `{ fieldName: { fileId: "..." } }` in the body.
- Server validates each fileId (session match, no double-claim).
- On success, `Registration.formData` is written with the denormalized file object.

Required FILE field server-side validation: if the field is required and no fileId is provided (or fileId is invalid), the API returns 400 with a clear message.

### Admin: viewing uploaded files

On the attendee detail page, the Registration Answers card displays FILE field values as:

```
Commercial Registration
  📄 CR_2026.pdf  (482 KB · PDF)
  [View]  [Replace]  [Remove]
```

- **View** — opens `GET /api/events/[eventId]/files/[fileId]/stream` in a new tab. The server re-validates the admin's `authorizeEvent` access per request and pipes the blob bytes back. The browser renders inline or downloads based on the response's `Content-Disposition` (filename) + content-type. No URL the client retains; every read goes through a live admin session.
- **Replace** — out of scope for v1 (admin-side replacement is a non-goal). Button hidden in v1; document as v2.
- **Remove** — out of scope for v1. Button hidden in v1.

(For v1, admin can only view. Add Replace/Remove in v2 if needed.)

### CSV export

FILE field columns in CSV export show the original filename:

```
First Name,Last Name,Email,Commercial Registration
Mohanad,Rashad,mohanad@example.com,CR_2026.pdf
```

The filename is read from `formData[fieldName].filename`. Empty cell if no file.

For admins who want the actual files, they download them per-attendee through the detail page. (Bulk download is a v2 candidate.)

### Email template substitution

`{{fieldName}}` for a FILE field resolves to the original filename. The email body shows: *"You attached: CR_2026.pdf"* rather than a URL.

Why not the signed URL: URLs expire in 5 minutes. By the time the email arrives in the visitor's inbox, the URL is dead. A filename is always meaningful.

### Badge template substitution

Same as email: filename only, truncated to fit the badge layout (~30 chars).

### Edge cases

- **Visitor changes browser tabs/closes the tab after uploading but before submitting.** The cookie persists 24 hours. If they reopen the tab within that window, the form might restore the file reference (depends on `localStorage` integration — out of scope for now; v1 just re-uploads). After 24 hours, the orphan cleanup deletes the file.
- **Two visitors with the same session ID (unlikely but possible if they share a device).** The session ID is per-cookie, per-browser. Multi-tab visitors share the cookie but each fills the form independently. Files are scoped by formFieldId + sessionId, so cross-tab interference is bounded.
- **Visitor submits with a file that was deleted from Blob (e.g., by the cleanup cron).** The submission validation rejects with "File no longer available; please re-upload." Edge case — only happens if the visitor sat on the form for >24 hours.
- **Admin deletes the FormField after files were uploaded.** The cascade removes both the field and its files (rows deleted, blobs cleaned up by nightly cron).
- **Visitor sees the field but the field's `metadata.allowedMimeTypes` is empty (admin misconfiguration).** Render the field with a warning ("Upload temporarily unavailable") and the picker disabled. Server-side: `handleUpload` rejects everything.
- **File mid-upload when visitor navigates away.** The HTTP upload is browser-mediated. If the user closes the tab, the upload aborts. Vercel Blob may or may not have a partial blob — `onUploadCompleted` only fires on full success, so partial uploads never create a DB row. Cleaned up by Blob's own internal lifecycle.

---

## Schema Changes

**One Prisma migration:**

```prisma
model RegistrationFile {
  // (full definition as in Architecture section above)
}

model FormField {
  // ... existing fields preserved ...
  files RegistrationFile[]
}

model Registration {
  // ... existing fields preserved ...
  files RegistrationFile[]
}
```

The migration is purely additive — no changes to existing columns, no data backfill needed. Existing FILE FormField rows continue to exist; they just gain a working renderer.

---

## Implementation Stages

### Stage 1 — Storage + upload pipeline (no admin or visitor UI yet)

- New table `RegistrationFile` (Prisma migration).
- `src/lib/services/registration-file.service.ts` — wraps blob.ts for FILE-field-specific concerns (token minting, completion webhook, orphan cleanup, and in Stage 3 stream-through read helpers).
- Cookie helpers in `src/lib/registration/upload-session.ts` — sign, verify, set.
- API routes:
  - `POST /api/register/[eventSlug]/upload-token` — issues Vercel Blob upload token.
  - `POST /api/register/[eventSlug]/upload-completed` — webhook from Vercel after upload succeeds.
  - `DELETE /api/register/[eventSlug]/files/[fileId]` — pre-submission deletion (visitor-initiated replace/remove).
- Wire the `reg_upload_session` cookie into the GET for `/register/[eventSlug]` — the Route Handler at `src/app/api/register/[eventSlug]/route.ts` sets it via `NextResponse.cookies.set`.
- Extend the orphan-cleanup cron at 03:30 UTC to also handle `RegistrationFile`.

**Smoke test:** before declaring Stage 1 done, write a quick test script (admin-only diagnostic endpoint OR a Playwright probe) that mints a token, uploads a tiny file, verifies the DB row, fetches the signed URL, deletes the file. Confirms the pipeline works end-to-end against staging.

**Deliverable:** the upload pipeline works. No UI yet. Files can be uploaded via direct API calls.

### Stage 2 — Admin UI (form-builder) + visitor UI (renderer)

- New `<FileFieldSettings>` component in `src/components/admin/file-field-settings.tsx`. Max size input + allowed-types checkboxes.
- Wire it into the FormField Add/Edit dialogs in `form-builder/page.tsx`, conditionally rendered when type is FILE.
- Persistence via `FormField.metadata`.
- New `<FileUploadControl>` component in `src/components/public/file-upload-control.tsx`. States: empty, uploading (with progress), uploaded (with replace/remove). Bilingual copy (EN/AR per existing pattern).
- Public renderer (`(public)/register/[eventSlug]/page.tsx`) — add the FILE branch using `<FileUploadControl>`.
- Client-side validation: file size and type checks before initiating upload.
- Form submission: include fileIds in the payload.
- Server submission validation: confirm fileIds match session, link to new registration.

**Deliverable:** end-to-end visitor flow works. Admin configures the field, visitor uploads and submits, file lands in the DB with the registration.

### Stage 3 — Admin display + integrations

- Attendee detail page (`registration-answers-card.tsx`): render FILE fields with filename + size + View button.
- New API endpoint `GET /api/events/[eventId]/files/[fileId]/stream` (admin-only, scoped by event membership via `authorizeEvent`). Re-validates per request and pipes the blob bytes back from `streamPrivateBlob` with the original content-type and a `Content-Disposition` derived from the stored filename. Matches the existing `PhaseReceipt` read endpoint at `src/app/api/portal/[eventSlug]/receipts/[receiptId]/route.ts`.
- CSV export: emit one column per FILE field with the filename.
- Email template variable substitution: `{{fieldName}}` → filename.
- Badge generator: same, truncated.
- `formatFieldValueForDisplay` helper extended to handle the FILE shape.

**Deliverable:** admins can see and download visitor-uploaded files. The full loop closes.

---

## Quality Disciplines

### Pre-flight audit before each stage

Audit must catch:
- Existing FormField.options / FormField.metadata reads that might break on FILE fields.
- Any code path that assumes `formData[fieldName]` is a string or array (FILE fields use object).
- Any place that iterates form fields without considering FILE-specific concerns.

### Mockups before code

Stage 2 touches the form-builder (~1900+ LOC) and the public registration page. Both deserve mockups before code, per `CLAUDE.md`:
- `<FileFieldSettings>` placement in the field editor.
- `<FileUploadControl>` empty / uploading / uploaded states + replace/remove flow.

Stage 3's attendee-detail display also benefits from a quick mockup since the file representation needs to fit alongside other field types' values.

### Staging-first, smoke-test in Stage 1

The unauthenticated upload pipeline is the architecturally novel part. Stage 1 ends with a real upload-fetch-signed-URL-delete cycle against staging before declaring done. Document any SDK API deltas if the `@vercel/blob` package surface has changed since `PhaseReceipt` was built.

### Reuse PhaseReceipt's patterns

`src/lib/blob.ts` already has `uploadPrivateBlob`, `streamPrivateBlob`, `deleteBlob`. Reuse these — don't reinvent. The `RegistrationFile` service is a thin wrapper around the same primitives.

### Backwards compatibility

- Existing FILE FormField rows continue to exist and now gain a working renderer. No data migration needed.
- Existing Registrations without FILE fields are unaffected.
- The new `reg_upload_session` cookie is set only on the public registration GET. No other surface needs to know about it.

### No new infrastructure beyond what's already there

- Vercel Blob: already provisioned.
- Cron: existing nightly cron at 03:30 UTC, just extended.
- No new env vars (uses `BLOB_READ_WRITE_TOKEN` and `AUTH_SECRET`, both already set).

---

## Acceptance Criteria

### Stage 1

- [ ] Prisma migration adds `RegistrationFile` table with all FK relationships.
- [ ] `RegistrationFile` cascades correctly: deleting a FormField deletes its files; nulling Registration on RegistrationFile delete preserves the file row (the orphan cleanup catches it).
- [ ] `POST /api/register/[eventSlug]/upload-token` issues a valid token. Rejects unauthenticated (no cookie), rejects non-FILE field, rejects field on a different event.
- [ ] `onUploadCompleted` webhook creates a `RegistrationFile` row with correct linkage.
- [ ] `DELETE /api/register/[eventSlug]/files/[fileId]` deletes blob + row when session cookie matches.
- [ ] Orphan cleanup cron deletes `RegistrationFile` rows older than 24h with null `registrationId`, plus their blobs.
- [ ] Smoke test passes: end-to-end upload + signed URL fetch + delete works on staging.

### Stage 2

- [ ] Admin can add a FILE field, set max size (1-25 MB) and allowed types via checkboxes.
- [ ] Persistence: settings round-trip correctly through `FormField.metadata`.
- [ ] Public renderer shows the FILE upload control in all three states (empty / uploading / uploaded).
- [ ] Client-side validation: file size and type are checked before upload starts. Clear error messages.
- [ ] Upload progress bar shows real progress (not just spinner).
- [ ] Visitor can replace and remove the file before submission.
- [ ] Form submission includes fileIds correctly.
- [ ] Server-side validation: required FILE field rejects submission with no file.
- [ ] Multiple FILE fields on the same form work independently.
- [ ] Bilingual copy in all upload-control states (EN + AR).

### Stage 3

- [ ] Attendee detail page renders FILE fields with filename, size, mime-type, and View button.
- [ ] View opens a stream-through URL in a new tab. The server re-validates the admin's `authorizeEvent` access per request and pipes the bytes back. Closing the tab or revoking the admin's session immediately invalidates further access.
- [ ] CSV export emits filename column for each FILE field.
- [ ] Email template `{{fieldName}}` substitution renders the filename.
- [ ] Badge template substitution renders the filename, truncated if needed.
- [ ] `formatFieldValueForDisplay` handles FILE shape correctly across all admin surfaces.

### Whole feature

- [ ] All 3 stages deployed and verified on staging.
- [ ] Real productive-families-style test: an event with a "Commercial Registration" FILE field (required, PDF, max 5MB), a visitor uploads a real PDF, submits, admin views in detail page, downloads, sees filename in CSV export.
- [ ] No regression on existing events without FILE fields.
- [ ] Orphan cleanup verified on staging (manually create an abandoned upload, wait for the cron, confirm deletion).
- [ ] Bilingual rendering throughout.
- [ ] `postRegPhases` module flag does NOT gate FILE fields — they're part of the core form-builder module.

---

## Open Questions

1. **Cookie persistence across browser restarts.** `SameSite=Strict` + `HttpOnly` is right. But should the cookie persist across browser restarts (Max-Age 24h) or only for the browsing session? Default: 24h Max-Age. Lets visitors come back later within the day to finish.

2. **Should we hide the FILE option in the field-type dropdown until Stage 2 ships?** Today, admins CAN add FILE fields but they render broken on the public page. Once Stage 1 lands, that's still true (until Stage 2). Two options: (a) leave it visible and accept the broken-state period, (b) hide FILE from the dropdown until Stage 2 lands. Default: leave visible — admins might want to configure fields ahead of the renderer landing, and the broken state has existed for months already without complaint.

3. **Replace-button-on-uploaded-state — is it really useful?** Visitors who want to upload a different file can [Remove] then upload again. Two-button vs one-button UX. Default: keep both (Replace is a one-click shortcut for the common case).

4. **What happens if the same file is uploaded twice (same name, same content)?** Vercel Blob's `addRandomSuffix: true` makes the blob paths unique even if filenames collide. Two separate `RegistrationFile` rows. Fine.

5. **Max-size cap of 25MB hard ceiling?** Vercel Blob supports much larger. But our use cases (registrations, IDs, CRs) rarely exceed 10MB. The 25MB cap is a reasonable upper bound that prevents abuse without blocking real needs. Open to changing if a real event needs more.

---

## Notes for Claude Code

- This is a 3-stage spec. Each stage is mergeable individually.
- Stage 1 has a smoke test gate before declaring done. Don't skip it — the unauthenticated upload pipeline is the architecturally novel part.
- Reuse `src/lib/blob.ts` primitives. Don't reinvent.
- The `reg_upload_session` cookie pattern is new infrastructure for this codebase. The signing helper (using `AUTH_SECRET` via `crypto.subtle.sign`) needs care — mirror the OTP signing in `src/lib/portal/otp.service.ts` if a similar primitive exists.
- Honor existing patterns: services in `src/lib/services/`, validations in `src/lib/validations/`, components in `src/components/admin/` (admin UI) and `src/components/public/` (visitor UI — create if doesn't exist).
- Do not modify `PhaseReceipt` or its codepaths. Keep the FILE field implementation parallel and independent.
- Mockups required for Stage 2 (form-builder additions + visitor upload control) and Stage 3 (attendee detail rendering).
- Pre-flight audit before each stage. Surface deviations from spec in the PR description.
- Do not add tests unless explicitly asked.
- One commit per logical chunk within each stage. Push each stage as its own PR.

---

*Approved for implementation, stage by stage, with staging verification between stages.*
