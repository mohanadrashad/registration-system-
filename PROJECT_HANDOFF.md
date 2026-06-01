# Registration System — Project Handoff

**Last updated:** 2026-05-23 (end of marathon shipping session)
**Owner:** Mohanad
**Repo:** github.com/mohanadrashad/registration-system-
**Stack:** Next.js 16, Prisma 6, PostgreSQL on Neon, deployed on Vercel
**Storage:** Vercel Blob (Frankfurt region, Private mode)
**Translation:** MyMemory API (free tier, 50k chars/day with email param)
**Branch in progress:** none — between projects
**Production branch:** `main`, HEAD at `be18a8a` (Stage 3 backend merge)
**Working directory:** Git worktree at `C:\Users\mohan\AppData\Roaming\warp\Warp\data\worktrees\registration-system\arch-pass`

---

## What this project is

Internal registration platform for La Gloire (Riyadh events/hospitality company). Multi-event, multi-tenant, runs at `registration.itsbader.com`. Productive Families is the next real event launching, 3+ days out at last check.

---

## Tooling and conventions (unchanged from prior handoff)

- **Claude.ai** for strategy, spec, design. **Claude Code** for implementation. **Warp** terminal. **VSCode** editor.
- **Workflow:** spec → audit → mockup (if UI-touching) → chunked commits → PR → squash-merge via `gh` CLI.
- **End-of-stage discipline:** commit + push + Preview green + report status before next stage (lives in CLAUDE.md).
- **Worktree caveat:** `gh pr merge --delete-branch` fails because main is held by another worktree. Use squash-only, then delete remote branch via API, then detach + delete local. Pattern is muscle memory.
- **Database:** Production + staging Neon branches. Maintainer-run `prisma db push`. Never against production directly without staging verification first.
- **Vercel Preview environment** points at the staging Neon branch.

---

## What's shipped (recent activity, newest first)

### 2026-06-01 — Cross-event isolation closed on email campaigns + emails routes migrated

Security fix bundled with PR 5 of the auth-posture sweep. The `campaigns/[campaignId]` GET and DELETE handlers used unscoped `findUnique` / `delete` operations keyed only on `id`. Even after the caller's authorization was verified against the URL `eventId`, the actual data op would proceed against any campaign by id regardless of event. A user with `authenticated` access to Event A could read any Event B campaign by knowing its CUID; a user with MANAGER access to Event A could delete one. Same class as PR #32 (form-fields cross-event isolation), but data-layer rather than auth-layer. Practical exploit requires knowing the target CUID (not enumerable from another event's UI), but the gap is real.

**Cross-event scoping + emails auth migration** — `bdd5654` (PR #36, squash merge). 3 files, +37/−24.

| Handler | Cross-event fix |
|---|---|
| `GET` | `findUnique({ where: { id } })` → `findFirst({ where: { id, eventId } })`. Returns 404 if campaign belongs to another event. |
| `DELETE` | `delete({ where: { id } })` → `deleteMany({ where: { id, eventId } })` + count-based 404. Single round-trip, no read-then-write race window. |

Same row-level scoping pattern as `contacts/[contactId]/route.ts:18-22` ("canViewEvent ... ; also row-level: contact.eventId !== eventId post-query"). Defensive comments added on both handlers prevent a future cleanup pass from "simplifying" back to the unscoped form. No exploitation evidence in production logs (handlers don't emit user+event identity, same as PR #32).

**Second cross-event isolation gap surfaced and closed by the sweep.** Both finds emerged from the same audit discipline: verify the `authorizeEvent` call AND verify the data ops scope by `eventId`. The data-op verification is the easy-to-miss half — see the new `[[auth-migration-audit-pattern]]` memory for the codified rule.

Behavior change alongside the security fix: campaign DELETE role tightened from per-event `editor` to per-event `manager`. Pre-flight production data check cleared: 0 non-SUPER_ADMIN users without MANAGER membership exist on prod; 0 events have DRAFT campaigns (the only deletable category — `EmailLog.campaignId` FK with `NO ACTION` already blocks deletion of campaigns with logs). Two-layer safety net: role bump + FK constraint.

Six handlers migrated total: templates GET/POST (`authenticated`/`editor`), campaigns GET/POST (`authenticated`/`editor`), campaigns/[campaignId] GET/DELETE (`authenticated`/`manager`, both with cross-event scoping). No module gates (no `emails` flag in EventModules — email is core). Sweep progress: 5 of 6 PRs done. Only PR 6 (domain + email-settings, `customEmail` module gate, pre-cleared) remains.

### 2026-06-01 — WhatsApp + Check-in handlers migrated, module gates introduced

PR 4 of 6 in the auth-posture sweep. Five handlers across five files migrated from legacy `auth()` to `authorizeEvent` AND module-gated for the first time in the sweep: `whatsapp/stats` (GET + module `whatsApp`), `whatsapp/send` (POST editor + module `whatsApp`), `whatsapp/logs` (GET + module `whatsApp`), `checkin/recent` (GET + module `checkIn`), `checkin/search` (GET + module `checkIn`).

**WhatsApp + check-in auth migration with module gates** — `7ba283c` (PR #35, squash merge). 5 files, +25/−31 (−6 net).

Two callouts:

(a) **New behavior — module gates introduced for the first time in the sweep.** Events without `EventModules.whatsApp = true` or `EventModules.checkIn = true` now get a 403 with code `MODULE_NOT_ENABLED` (per `api-auth.ts:127-135`) instead of reaching the handler. Pre-flight production data check cleared: 0 events have WhatsApp/Check-in data while the corresponding module is off. The pattern PRs 5 and 6 will follow for their respective module gates.

(b) **Audit catch.** `whatsapp/send`'s inline `whatsAppService.isEnabled(eventId)` check was originally flagged as redundant by the sweep audit. Pre-push review caught that the module gate and the inline check are semantically different: the module gate reads `EventModules.whatsApp` (feature toggled on?), the inline `isEnabled` reads `EventWhatsAppSettings.isActive && accessToken && phoneNumberId` (credentials configured?). An event can have the module on but no credentials yet. The inline check stays; comment rewritten to disambiguate. Lesson for PRs 5–6: assume inline post-auth checks are semantically distinct from module gates until proven otherwise — read the implementation, don't infer from the variable name.

Smoke surfaced a latent UI quirk (sidebar visibility on module-off events) — pre-existing, see "Known unresolved bugs" below. Sweep progress: 4 of 6 PRs done. PRs 5–6 remaining (emails templates + campaigns; domain + email-settings).

### 2026-06-01 — Misc admin handlers migrated + contacts/import role tightened

PR 3 of 6 in the auth-posture sweep. Eight handlers across six files migrated from legacy `auth()` to `authorizeEvent`: capacity (GET + POST), badges/template (GET + PUT), attendees (GET), form-fields/reorder (POST), form-fields/seed (POST), and contacts/import (POST).

**Misc admin auth migration + contacts/import role tightening** — `f447f31` (PR #34, squash merge). 6 files, +29/−56 (−27 net).

Two callouts beyond the mechanical pattern:

(a) **`contacts/import` role tightened** from global `canEdit(getRole(session))` to per-event `editor`. Closes the deferral from PR #30. Pre-flight production data check confirmed risk surface = 0: only 2 global EDITOR+ users exist (both `SUPER_ADMIN`, which bypasses `authorizeEvent` per `api-auth.ts:97`); zero non-SUPER_ADMIN global editors; zero events with imports in the last 30 days. Tightening is preventative against future global-editor accounts being added without per-event membership.

(b) **Two redundant `prisma.event.findUnique` lookups dropped** in `form-fields/seed` and `contacts/import`. `authorizeEvent` already loads the event (`api-auth.ts:91-92`) and 404s if missing, so the inline lookups were dead post-migration. Same cleanup pattern PR #30 used in `contacts/route.ts:149` (*"Reuse ctx.event (loaded by authorizeEvent) instead of re-fetching"*). For `contacts/import`, kept the local `const event = ctx.event` binding so downstream `event.categories` reference didn't need touching.

Smoke surfaced the [[radix-dialog-post-refetch-race]] on a new surface (capacity-save, second save in a row); pre-existing bug not caused by this PR, see "Known unresolved bugs" below. Sweep progress: 3 of 6 PRs done. PRs 4–6 remaining (WhatsApp + check-in; emails templates + campaigns; domain + email-settings).

### 2026-06-01 — Statistics + Registrations GET handlers migrated to authorizeEvent

PR 2 of 6 in the auth-posture sweep. Four read-only GET handlers under `/api/events/[eventId]/...` migrated from legacy `auth()` to `authorizeEvent(eventId, { role: "authenticated" })`: `statistics/route.ts`, `registrations/route.ts`, `registrations/stats/route.ts`, `registrations/export/route.ts`. Pure mechanical pattern migration — same shape as PR #30 (Contact GET) and the GET portion of PR #32 (form-fields).

**Statistics + Registrations auth migration** — `865f558` (PR #33, squash merge). 4 files, +13/−16.

No security finding this round, unlike PR #32. Every migrated handler already scopes its query by `eventId` at the Prisma layer, so cross-event data leakage was not possible — only cross-event metadata polling by authenticated-but-not-member users. Migration closes that polling gap and brings these four in line with the auth-posture pattern. Behavior unchanged for legitimate admin callers.

Vercel preview build hit a transient Neon `P1001` cold-start during `prisma db push --skip-generate`; redeploy passed cleanly without code changes.

### 2026-06-01 — form-fields cross-event isolation closed + authorizeEvent sweep opens

Security fix. `form-fields/[fieldId]` GET and DELETE used the global `authorize()` helper, which checks only the caller's global role and NOT per-event `EventMember` status. A user with any global editor-tier role who is a member of Event A could read or delete a form field belonging to Event B by knowing the field id — the `eventId` in the URL was decorative. PATCH on the same file already used `authorizeEvent` and was unaffected. No exploitation evidence in production logs (handlers don't emit user+event identity, so the question is unanswerable from logs alone). Shipped on security-fix merit regardless.

**form-fields cross-event isolation** — `5c16dfa` (PR #32, squash merge). 1 file, +5/−7.

| Handler | Before | After |
|---|---|---|
| `GET` | `authorize()` — global role only | `authorizeEvent(eventId, { role: "authenticated" })` |
| `DELETE` | `authorize("editor")` — global editor only | `authorizeEvent(eventId, { role: "editor" })` |

Also opens the broader auth-posture sweep — audit identified ~30 handlers across `src/app/api/events/[eventId]/...` still on legacy `auth()`. Ships in 5 more route-family PRs. Behavior-change PRs (customEmail module gate; campaign DELETE role bump) pinned to the end of the ship order; both pre-cleared by production data check (0 `EventEmailSettings` rows with `customEmail` off; `EmailLog.campaignId` FK already blocks deletion of campaigns with logs).

### 2026-05-25 — PhaseReceipt buildReceiptPathname cleanup

Mechanical dead-code follow-up from FILE field Stage 3 audit. `buildReceiptPathname` in `receipt.service.ts` was being called inside `onBeforeGenerateToken` but the SDK never consumed its return value — `@vercel/blob` `handleUpload` doesn't expose a pathname override (the SDK ceiling documented in `[[vercel-blob-pathname-ceiling]]`). The `_serverComputedPath` field the result was stashed in was explicitly labeled "marker for grep / debugging" and ignored.

**PhaseReceipt cleanup** — `2979316` (PR #31, squash merge). 2 files, −48 net lines (50 removed, 6 added). Removed: `buildReceiptPathname` function + its `CONTENT_TYPE_EXT` helper + the import + the dead `serverPath` computation + three stale comment blocks pointing at the dead computation + the `_serverComputedPath` marker spread. Replacement: a single tight 6-line comment pinned to `@vercel/blob v2.3.3` so a future reader who finds it can check whether the SDK has moved before assuming the limitation persists.

Net delta beat the audit estimate (−48 vs the audit's −44) because of whitespace collapse around the removed blocks. Zero behavior change — the SDK never consumed the dead computation; storage path scoping (per-event signed token + addRandomSuffix + allowedContentTypes + maximumSizeInBytes) is unchanged. Sibling-dead-code sweep confirmed no other unused exports in `receipt.service.ts`.

### 2026-05-25 — Contact GET handlers migrated to authorizeEvent

Mechanical auth migration. Closes the asymmetric posture surfaced during Admin-Edit-Fix Stage 2 audit: writes were gated per-event but the matching Contact reads stayed on legacy `auth()`, letting any authenticated user (across any event) list/read/export another event's Contact data. Cross-event filters at query/row level prevented data leak between events, but membership wasn't checked.

**Contact GET auth migration** — `8988b00` (PR #30, squash merge).

Audit-driven scope expansion: queue item was a single handler (`contacts/[contactId]/route.ts` GET), audit found two siblings with identical vulnerability shape. Bundled all three in one PR:

| Handler | Cross-event scoping (preserved) |
|---|---|
| `contacts/[contactId]/route.ts` GET | Row-level: `contact.eventId !== eventId` post-query |
| `contacts/route.ts` GET (list) | Query-level: `where: { eventId }` |
| `contacts/export/route.ts` GET (CSV) | Query-level: `where: { eventId }` (orphan per [[csv-export-routes]]; migrated for posture consistency) |

Migration mechanic (identical 3×): drop `auth` import (sibling write handlers in each file already use `authorizeEvent`), move `await params` above the auth call, replace `auth() + null check` with `authorizeEvent(eventId, {role: "authenticated"}) + ctx instanceof NextResponse` early return. Identical 7-line comment per handler explaining the role choice (Stage 2 approvals-GET precedent at `src/app/api/events/[eventId]/approvals/route.ts:20` is the canonical pattern).

Behavior change for legitimate callers: NONE. Admin users with event membership see the same data. Only cross-event polling by authenticated-but-not-member users is closed.

What's NOT in scope: `contacts/import/route.ts` POST (different threat model — write, not read; role decision deferred) + ~25 other legacy-`auth()` files across `src/app/api/events/[eventId]/*`. Each deserves its own audit + role decision. Bundle into a future "auth posture sweep" stage if warranted.

### 2026-05-25 — Admin-Edit-Fix Stage 4 + ARC COMPLETE

Stage 4 of the admin-edit-fix arc — the user-visible payoff for the audit columns Stage 1 shipped. Admins now see who edited a contact + when, and who approved/rejected each registration. **With this on production, the entire admin-edit-fix arc is fully realized** (Stages 1, 2, 3 backend-only, 4 — UI deferred from Stage 3 is the only outstanding item).

**Admin-Edit-Fix Stage 4** — `77761d1` (PR #29, squash merge).

Shipped:
- `src/lib/format-relative-time.ts` — bucketed "just now / N minutes / N hours / N days" → flips to short absolute date past 14 days. Future-dated input also falls through to absolute (clock-skew defensive). Extracted (not inlined) for reuse by future audit surfaces.
- `approvalService.getRecentDecisions(eventId, limit=100)` — new service method. Filters to rows with `approvedAt` OR `rejectedAt` set; two-pass sort (Prisma orderBy approvedAt + rejectedAt then in-memory merge by max-of-both, since Prisma can't express `coalesce` in orderBy). Returns `{decisions, totalRecent}`.
- `/api/events/[eventId]/approvals` GET extended with `recentDecisions` + `totalRecentDecisions` in the response.
- `/api/events/[eventId]/contacts/[contactId]` GET extended to include `updater` on Contact + `updater`/`approver`/`rejecter` on Registration with `UserRef`-shaped select (id/name/email only — no role, no password hash).
- Attendee header: new "Last edited by [Name] · relative time" line, conditional on `contact.updater !== null`.
- AdminCard: new "Decision" labeled section showing approver/rejecter + timestamp + reason, conditional on either relation being non-null.
- Approvals dashboard: new third tab "Recent Decisions" with Action/By/When/Reason columns, "(unknown)" actor fallback for legacy rows, "Showing N of M total" footer only when truncated.

Two pre-push diff-review refinements applied:
- Anchor-comment near `contact.updater` render explaining the `contact.updatedAt` ↔ `updatedBy` synchrony (catches the fragility for future writers who might bump `updatedAt` without setting `updatedBy`).
- "Decision" uppercase section header on AdminCard's audit block — matches the form-builder Step strip's small-uppercase pattern, neutral label works for both approve + reject branches.

Time-estimate reframe noted in the PR: queue had this as "~1-2 hours, no backend" but actual was ~3-5 hours with real backend work (GET extension + new service method + new endpoint field). Future read-only audit features should assume relation joins need adding unless audit confirms otherwise.

### Admin-Edit-Fix arc — close-out

All 4 stages shipped:

| PR  | Stage              | Commit     | Shipped                                                                |
|-----|--------------------|------------|------------------------------------------------------------------------|
| #21 | Stage 1            | `98f8813`  | CSV-drift fix + audit-trail schema (6 cols, 4 relations, 3 indexes)    |
| #22 | Stage 2            | `63a588e`  | Five routes migrated to authorizeEvent; cross-event guards             |
| #23 | Stage 3 (backend)  | `be18a8a`  | adminReplaceFile/adminRemoveFile + endpoints + RequiredFieldWarning    |
| #29 | Stage 4            | `77761d1`  | Audit trail display (header + AdminCard + Recent Decisions tab)        |

What's outstanding from this arc: **Stage 3 UI** (Replace/Remove buttons + provenance line) was reverted before Stage 3 merge due to the Radix race documented in `[[radix-dialog-post-refetch-race]]`. Backend is live; UI revival requires local-dev-build-with-sourcemaps diagnosis per the memory's revival path. Stays in queue.

### 2026-05-24 — Field-Mapping Stage 3c + FEATURE COMPLETE

Final sub-chunk of Stage 3. **The entire field-mapping feature is now live and end-to-end usable on production.** Admins can preview the backfill diff, toggle overwrite, apply, and see per-row failure attribution without leaving the form-builder page. Pending the maintainer's final production-verification walk on Productive Families, the original Reg #cmpjoqs3 visitors that started this conversation should now display their real names after one backfill click.

**Field-Mapping Stage 3c** — `c944daf` (PR #28, squash merge).

Shipped:
- `src/components/admin/backfill-dialog.tsx` (~666 LOC) — single Radix Dialog with internal phase state machine (preview → applying → result; or preview → stale → preview-refresh). Sub-views: PreviewView (3-bucket summary + overwrite toggle + show-details expander + Cancel/Apply), ApplyingView (spinner, dialog can't close mid-apply), ResultView (updated count + per-row failures with Copy buttons + interruptedAtRow banner), StaleView (409 recovery with toggle persistence).
- Always-mounted at form-builder page root per the quick-actions-card.tsx gold-standard pattern. `onOpenChange` blocked while phase === "applying". Parent refetch deferred via setTimeout(0) on close — load-bearing per the radix-dialog-post-refetch-race lesson.
- Empty-state banner ("Nothing to update — N contacts are already correct.") gated on `!previewLoading` so toggle re-fetches don't flash stale counts.
- Toggle persists across stale-recovery within a single dialog session; resets to OFF on each fresh open.
- Copy-error button uses `navigator.clipboard.writeText` with a long-lived `toast.warning` fallback for enterprise setups that deny clipboard access.
- Two review fixes caught at pre-push diff review: single `res.json()` parse in `apply()` (was double, would have swallowed non-stale 409 error messages); `isEmpty` gated on `!previewLoading` to avoid empty-state banner flash during toggle re-fetch.

### Field-Mapping feature — close-out

All 5 PRs shipped over a single day:

| PR  | Stage              | Commit     | Shipped                                                                 |
|-----|--------------------|------------|-------------------------------------------------------------------------|
| #24 | Stage 1            | `b2bf98a`  | Schema + API + form-builder UI (tag fields, summary card, swap dropdown) |
| #25 | Stage 2            | `acee376`  | Registration endpoint resolver — fixes new-visitor dashboard            |
| #26 | Stage 3a           | `bc0a878`  | Backfill preview service + endpoint                                     |
| #27 | Stage 3b           | `a9ec839`  | Backfill run endpoint + hybrid batch writer + stale guard               |
| #28 | Stage 3c           | `c944daf`  | Backfill UI — dialog + result modal + button wiring                     |

What this unblocked: Productive Families launch readiness. New registrations populate Contact columns correctly via mapped fields (Stage 2); historical Reg #... visitors get retroactively fixed via the maintainer-triggered backfill (Stage 3). No staging environment was used for verification — legacy fallback served as the safety mechanism, and verification happened directly on production with a rollback path documented at each stage.

Spec at `specs/FIELD_MAPPING_SPEC.md` is now fully realized. Memory entry at `field-mapping-stage3-complete.md` covers all of Stage 3's locked invariants for future readers.

### 2026-05-24 — Field-Mapping Stage 3b (backfill run endpoint + hybrid batch writer)

Backfill is now write-capable end-to-end from the API surface. No UI entry point yet — admins can hit the endpoints via curl, but the disabled "Apply to existing registrations" button on `FieldMappingSummaryCard` won't wire up until 3c lands. **Production verification deferred to 3c** — the full backfill flow gets verified end-to-end through the UI once dialog + result modal exist.

**Field-Mapping Stage 3b** — `a9ec839` (PR #27, squash merge).

Shipped:
- `executeBackfillBatches(diffs)` in `field-mapping-backfill.service.ts` — hybrid fast-path/slow-path writer. Fast path: 100 updates in one `prisma.$transaction` (`BACKFILL_BATCH_SIZE = 100` exported). On batch failure, slow path replays the failed batch per-row with try/catch for per-row attribution (`contactName` + `contactEmail` in the failure object per Clarification 2). Outer try/catch (Clarification 3) returns `{updated, failed, interruptedAtRow}` if anything escapes the batch loop entirely (Prisma client crash, OOM); `interruptedAtRow` is the 1-indexed count of rows that finished processing before the orchestrator died.
- `loadBackfillDecisions(eventId, overwriteNonEmpty)` — uncapped variant of the existing `computeBackfillPreview` (refactored to share the new internal `gatherBackfillDecisions` helper, single source of truth for the decision sweep). Writer operates on the full diff set, not the 500-cap'd UI subset.
- `POST /api/events/[eventId]/field-mapping/backfill/run` — MANAGER role. Body `{overwriteNonEmpty, expectedWillUpdate}`. Stale guard: server re-runs `loadBackfillDecisions`; exact-match required on `willUpdate` count or 409 `BACKFILL_PREVIEW_STALE` with `{expectedWillUpdate, currentWillUpdate}`. Writer operates on the freshly-loaded diffs from the same re-run, not the client's snapshot. Single INFO log line per spec quality discipline (`[field-mapping-backfill] eventId=... adminUserId=... overwrite=... updated=... failed=... interruptedAtRow=?`) — IDs only, no PII.
- `backfillRunSchema` + `MAPPING_ERROR_CODES.BACKFILL_PREVIEW_STALE` added to `src/lib/validations/field-mapping.ts`.

Fixture replay covered 4 scenarios (happy path / fast-fail+slow-recover / fast-fail+slow-partial / single-batch-multi-failure). Outer-catch path not in fixture — synthesizing a Prisma client crash in JS replay requires contrivance that proves nothing; code path commented inline.

Sub-chunk progress: 3a ✓ (preview, PR #26), **3b ✓ (run + writer, PR #27)**, 3c remains (UI: dialog + result modal + button wiring).

### 2026-05-24 — Field-Mapping Stage 3a (backfill preview service + endpoint)

Read-only chunk of Stage 3 (backfill). Sets up the service layer + preview endpoint that the dialog (3c) and the run endpoint (3b) both consume. **No writes anywhere yet.** Productive Families historical Contact rows still show as `Reg #...` until 3b ships and an admin runs the backfill.

**Field-Mapping Stage 3a** — `bc0a878` (PR #26, squash merge). Two commits collapsed: `61f1d34` (initial service + endpoint) + `76a41ad` (lock diff sort to `createdAt: "asc"` — caught in review before merge, prevents 3b's `expectedWillUpdate` guard from drifting between preview and run calls).

Shipped:
- `src/lib/services/field-mapping-backfill.service.ts` — `resolveContactColumnsForRegistration(registration, fields, overwriteNonEmpty)` pure per-row decision + `computeBackfillPreview(eventId, overwriteNonEmpty)` aggregator. Reuses Stage 2's `resolveContactColumns` resolver as-is (no duplication).
- `POST /api/events/[eventId]/field-mapping/backfill/preview` — MANAGER role (even though no writes — response includes attendee names + diffs). Body `{overwriteNonEmpty: boolean}`. Returns `{willUpdate, alreadyCorrect, skipped, diffs[], diffsTruncated}`. Diffs capped at 500; sorted by `createdAt` ascending.
- `backfillPreviewSchema` added to `src/lib/validations/field-mapping.ts`.

Locked invariants for 3b consumption:
- **Per-column overwrite gate** (not row-level). A single row can write `firstName` + skip `email` + skip `organization` all from one update.
- **Email special rules.** Synthetic → real bypasses the toggle (always replace). Empty resolved email → never write (no retroactive synthesis). Real → different real → write only when toggle ON.
- **`previous` shape:** same keyset as `changes`. UI iterates `Object.entries(changes)` and reads `previous[col]` for the "from" side.
- **Bucket assignment:** `update` if `changes` non-empty; else `alreadyCorrect` if any column had a non-null resolved match; else `skipped`.
- **Sort:** `createdAt: "asc"`. Oldest first survives the 500-cap truncation; 3b inherits this stable contract.

Stage 2 lesson paying off: local `npx tsc --noEmit` caught a Prisma `where`-shape error (`step: { phase: {...} }` not `phase: {...}` directly) before push. Vercel TS would have caught it; local check saved a round trip.

Sub-chunk plan:
- 3a (this commit) — preview service + endpoint
- 3b — run endpoint with hybrid batch writer + `expectedWillUpdate` guard
- 3c — UI (preview dialog + result modal + wire `onApplyToExisting` on `FieldMappingSummaryCard`)

### 2026-05-24 — Field-Mapping Stage 2 (registration endpoint resolver)

The register endpoint now reads each FormField's `mapsTo` tag to assemble Contact column values, with legacy literal-key + body.fullName fallbacks preserved. **Productive Families dashboard fix for NEW visitor registrations is now live** — once the form's three fields are tagged (First Name → FIRST_NAME, Middel Name + Third Name → 2× LAST_NAME), incoming registrations populate Contact.firstName and Contact.lastName correctly. Historical visitors still show `Reg #...` — Stage 3 (backfill) handles those.

**Field-Mapping Stage 2** — `acee376` (PR #25, squash merge). Two commits collapsed into one: `0c2aa84` feature + `839b06d` TS-strict cast fix on `metadata` (zero runtime delta — Prisma's `InputJsonValue` excludes null but runtime accepts it; matches existing pattern at `contacts/[contactId]/route.ts:130-135`).

Shipped:
- `src/lib/services/field-mapping.service.ts` — pure `resolveContactColumns(registrationFields, formData, legacyBodyFullName)` function. No DB access. Reused by Stage 3 backfill. Resolution order: mapped FULL_NAME → mapped FIRST_NAME/LAST_NAME(multi)/EMAIL/PHONE/ORG/DESIG → legacy literal-key formData read → final-rung body.fullName splitter (firstName + lastName only).
- `src/app/api/register/[eventSlug]/route.ts` — removed legacy destructure (line 188) + legacy fullName splitter block (lines 419-442). Replaced with resolver call. Six `||` non-empty-wins guards on Contact update branch preserved BYTE-FOR-BYTE (only LHS expressions changed). Create branch uses `?? ""` for NOT NULL columns + raw nullable values for the rest.
- FULL_NAME drift defense: validator should prevent FIRST_NAME/LAST_NAME alongside FULL_NAME, but if drift exists, resolver emits one `console.warn` and proceeds with FULL_NAME winning. Never throws — registration submissions must not crash on bad mapping state.

Behavior changes (called out in PR description for traceability):
- **Trim-on-read** (positive). `readString` returns null for empty-after-trim. Visitor typing `"  Mohamed  "` now persists as `"Mohamed"`. Non-string values in text fields no longer cause Prisma type errors at the DB layer.
- **`body.fullName` no longer lands in Contact.metadata.** The new `LEGACY_KEYS` filter strips 7 keys (the 6 contact columns + `fullName`) when computing `additionalFields`; pre-Stage-2 only stripped 6. Niche but real for untagged events that relied on `Contact.metadata.fullName`.

Deviations:
- Dropped the staging-harness requirement from Stage 2 acceptance criteria. No persistent staging env exists (Preview deployments are ephemeral); legacy fallback IS the safety mechanism — untagged events behave identically to today. Verification runs directly on production via the 4-step gate documented in PR #25.

Lesson:
- `npm run lint` doesn't run TS strict-mode; Vercel's `next build` does. Run `npx tsc --noEmit` locally before `git push` from now on, especially for files that touch Prisma input types. First Stage 2 push failed Vercel TS check on a metadata `||` chain narrowing to a union containing null.

### 2026-05-24 — Field-Mapping Stage 1 (schema + API + form-builder UI)

Stage 1 of the 3-stage field-mapping rollout. Admins can now tag any FormField with a Contact-column role from the form-builder. **Runtime registration behavior is unchanged in this stage** — Stage 2 (resolver in `/api/register`) is what actually fixes the Productive Families dashboard for new visitors. Tags saved now are read once Stage 2 ships.

**Field-Mapping Stage 1** — `b2bf98a` (PR #24, squash merge). Three chunks: schema (`eee97a2`) + API (`4c58de8`) + form-builder UI (`b7d1494`).

Shipped:
- `FieldMapping` enum (7 values: FIRST_NAME, LAST_NAME, FULL_NAME, EMAIL, PHONE, ORGANIZATION, DESIGNATION) + nullable `FormField.mapsTo` column. Production Neon in sync (`prisma db push` confirmed by maintainer).
- `PATCH /api/events/[eventId]/form-fields/[fieldId]` extended with mapsTo branch (validates type compat, single-value uniqueness, FULL_NAME mutual exclusion). Migrated to `authorizeEvent({role:"editor"})`. Cross-direction guard: changing a tagged field's type to one incompatible with its mapping is also rejected.
- `POST /api/events/[eventId]/form-fields/[fieldId]/swap-mapping` — atomic 2-step Prisma transaction with `MAPPING_SWAP_STALE` guard so a stale UI can't silently overwrite a re-tagged role.
- `GET /api/events/[eventId]/field-mapping/summary` — per-role summary endpoint. Public API contract; the form-builder summary card consumes in-memory phases data instead of this endpoint (Chunk 3 deviation — avoids extra round trip + race surface).
- `src/lib/validations/field-mapping.ts` — Zod schemas + typed `MAPPING_ERROR_CODES` + pure `checkMappingConflict()` helper used by both PATCH and swap routes.
- `src/lib/form-builder/field-mapping-labels.ts` — single source of truth for display labels, legacy formData keys, type-compat sets, multi-value roles set, FULL_NAME exclusion set. Consumed by both the validator and the UI.
- Form-builder UI: `FieldMappingSummaryCard` pinned above the phase strip + `MapsToDropdown` chip on each compatible field row. Conflict UX lives inside the dropdown (taken option shows `Used by "X" [Swap →]` two-line item, NOT a row-level ribbon — addresses the Radix close+refetch race surface from admin-edit Stage 3). `setTimeout(0)` defer on parent refetch is load-bearing per the same lesson.

Deviations:
- swap-mapping body simplified from spec's `{from:{fieldId,mapsTo}, to:{fieldId,mapsTo}}` to `{fromFieldId, role}` — a swap by definition transfers the same role on both sides.
- Cross-direction type-compat check added beyond spec acceptance criteria.
- Summary card reads in-memory `phases` data, not `GET /summary` (the endpoint stays as public contract).
- `MapsToDropdown` hides on incompatible field types with no existing mapping (TEXTAREA, NUMBER, layout fields). Renders if the field already has a mapping so admin can clear it.

What's NOT shipped yet:
- **Stage 2 (registration endpoint resolver)** — Productive Families dashboard still shows `Reg #...` for new registrations until this lands.
- **Stage 3 (backfill)** — historical data fix. "Apply to existing registrations" button is rendered but disabled.

### 2026-05-23 — Admin Edit Fix Stages 1, 2, 3 (backend-only) + Email-Optional + FILE field

Single marathon session. Three features fully shipped, one shipped backend-only with UI deferred.

**Admin-Edit-Fix Stage 3 (backend-only)** — `be18a8a` (PR #23, squash merge). **UI was reverted before merge** due to unresolved Radix race condition (see "Known unresolved bugs" below).

Shipped:
- `adminReplaceFile` + `adminRemoveFile` services in `registration-file.service.ts`
- Endpoints: `POST /api/events/[eventId]/contacts/[contactId]/files/[formFieldId]/replace`, `DELETE /api/events/[eventId]/contacts/[contactId]/files/[fileId]`, `GET /api/events/[eventId]/files/[fileId]/meta`
- `FormFieldDef.required` plumbing (interface + GET handler select)
- `<RequiredFieldWarning>` banner on attendee detail page (informational, no enforcement)
- **Bug #1 fix (load-bearing):** admin upload routes must put `authorizeEvent` INSIDE `onBeforeGenerateToken`, NOT at the top of the handler. The webhook (`onUploadCompleted`) has no admin cookie and 401s if auth is at the top. Mirrors visitor route pattern.

Deferred (reverted before merge):
- View/Replace/Remove buttons in FILE edit branch
- Replace/Remove confirm dialogs
- ProvenanceLine UI

Tombstone wording in FILE branch now reads: "Visitor-uploaded — admin replace/remove deferred to future stage."

**Admin-Edit-Fix Stage 2** — `63a588e` (PR #22). Five routes migrated to `authorizeEvent`: Contact PUT/POST/DELETE + Approvals POST/GET. Cross-event guard on Contact PUT/DELETE. Contact POST now stamps `updatedBy` on creation. Asymmetric posture (write gated, read open) on Approvals fixed.

**Admin-Edit-Fix Stage 1** — `51e17f9` + earlier commits (PR #21). CSV-drift bug fix (dual-store writes), audit columns (`Contact.updatedBy`, `Registration.updatedBy/approvedBy/approvedAt/rejectedBy/rejectedAt/rejectionReason`), approval service persists actor + reason, **diff-gate fix** prevents Registration over-stamping on Contact-only edits. Self-heals historical drift on first admin save of each row.

**Email-Optional Events** — PRs #18, #19, #20. Synthetic email helper consolidation, form-builder gating (Email Required disabled when portal on), Zod write-path validation, 12 display surfaces, `EmailLogStatus.SKIPPED`, `EmailCampaign.skippedCount`, check-in fallback to confirmation code.

**FILE field type** — PRs #15, #16, #17 (and #14 amendment). Three stages: storage + upload pipeline, admin form-builder + visitor UI, admin View button via stream endpoint.

### Pre-session (2026-05-19/20)

Category-Based Phase Logic, Vercel Prisma client regen fix, Attendee Detail Redesign, Phase Selections, Phase-Based Forms. All in production.

---

## Queue (in priority order)

1. **Stage 3 UI retry — Replace/Remove buttons + provenance.** Deferred from FILE-field admin-edit Stage 3 backend merge. Backend (services + endpoints + meta endpoint) is live; UI raced on Radix DOMException per `[[radix-dialog-post-refetch-race]]`. Revival starts with local dev build + sourcemaps to identify which library throws, then lift dialogs to page-level scope per the gold-standard pattern from quick-actions-card.tsx (now also followed by backfill-dialog.tsx). Hard-stop discipline still applies: 2 fix attempts max on any library-internal race.

2. **Admin-upload-from-empty.** Admin can upload a NEW file (not just replace) when FILE field has no value. Mostly a duplicate of Replace logic. Half-day of work once Stage 3 UI retry is resolved. Critical for Productive Families if visitor's commercial registration is missing.

3. **Auth posture sweep (deferred from Contact GET migration).** Migrate the remaining legacy-`auth()` handlers across `src/app/api/events/[eventId]/*` to `authorizeEvent`. Candidates per the audit during PR #30: `contacts/import/route.ts` POST (write, needs role decision), `registrations/export`, `statistics`, `whatsapp/*`, `emails/*`, `badges/*`, `checkin/*`. Each handler needs its own audit + role decision (read = `authenticated`, write = `editor` or `manager`, plus module-gating where applicable). Bundle as a single sweep stage, not piecemeal. ~25 handlers in scope.

---

## Known unresolved bugs

### Radix Dialog + post-operation parent refetch race (Stage 3 UI deferred)

**Symptom:** When admin Replace/Remove of FILE field UI triggers a post-operation parent refetch that causes the inner conditional render to swap (e.g., `file` goes from truthy → null after Remove), Radix's FocusScope throws `DOMException: Node.removeChild` from vendor bundle internals. Replace eventually rendered clean with one mitigation; Remove kept crashing.

**Tried (none fully resolved):**
1. Move dialogs outside `{file && ...}` conditional (kept dialogs mounted) — addressed dialog-level race but inner content still raced
2. `setTimeout(250)` between dialog close and parent refetch — didn't help (matched dialog's 200ms CSS exit duration but cleanup ran longer than expected)
3. CSS-hide buttons via `className={file ? "..." : "hidden"}` instead of conditional render — fixed Replace but not Remove (inner content like `FileMetaLine` and `ProvenanceLine` still race-unmounted)

**Race appears to be in library internals** — vendor chunks `f2f58a7e93290fbb.js` and `8d82774e7f1a1490.js`, not application code. Application code triggers it but doesn't throw the actual `removeChild`.

**Revival path (in priority order):**
1. **Start with local dev build + sourcemaps.** Production builds strip filenames; dev build would give actual line numbers in `radix-ui/dialog.js` or React internals. We've been patching blind.
2. **Lift dialogs to page-level scope.** Dialog state lives in parent component (attendee detail page), dialog elements render at page root. Page never unmounts during the racing transition. ~3-4 file touches.
3. **Switch FieldEditInput to uncontrolled dialog pattern.** Use Radix's `defaultOpen` instead of controlled `open` prop. May sidestep FocusScope's restoration logic.

**Lesson worth remembering:** when patching library-internal races, set a cycle limit before starting. Three patches without progress is the signal to revert and diagnose properly.

### Radix Dialog race surfaces on capacity-save (2026-06-01)

Same race class as the FILE Stage 3 entry above. Surfaced during PR #34 smoke test: on `/dashboard/events/<id>/settings`, first capacity save (500) lands cleanly; second save in a row (501) throws the same `DOMException: Node.removeChild` from Radix FocusScope vendor internals. User noted approvals page likely exhibits the same pattern (not directly verified in PR #34 smoke). Pre-existing on main — PR #34 only touched backend auth handlers and cannot have introduced this.

**Implication:** the race is not feature-specific. Two surfaces now confirmed (FILE Stage 3 UI + capacity-save) with at least one more suspected (approvals). That strengthens the case for the library-level diagnosis path (local dev build + sourcemaps, lift dialogs to page-level scope) over feature-by-feature mitigation. Bundle the investigation with the Stage 3 UI retry effort in the queue rather than spinning a separate diagnostic arc per surface.

**Reproducer:** open Settings → Capacity, save value A, save value B (any second save in the same dialog session). Throws on dialog close after the parent state mutates.

### Module-gated pages remain visible in sidebar when module is off (2026-06-01)

**Symptom:** WhatsApp and Check-in menu items show in the dashboard sidebar even when `EventModules.whatsApp = false` / `EventModules.checkIn = false` for the current event. Pages are reachable. After PR #35 (sweep PR 4), sub-endpoints (`whatsapp/stats`, `whatsapp/logs`, `checkin/recent`, `checkin/search`) correctly return 403 with `MODULE_NOT_ENABLED` instead of the prior 200-with-empty-data, so the page renders but the console fills with red 403s.

**Why this is in scope now:** PR 4 of the auth-posture sweep introduced the API-layer module gate. The UI's prior behavior was "silently empty when module off"; the new behavior is "loudly 403 when module off." The UX gap was latent — the sweep didn't cause it but did make it visible.

**Will repeat:** PR 5 (emails) and PR 6 (domain + email-settings) will exhibit the same pattern for any event with the corresponding modules off. Each adds its own API-layer module gate without touching the sidebar/menu UI. The pattern is consistent enough that a single "gate sidebar menu items on `EventModules` booleans" UX PR resolves all of them at once.

**Fix path:** small UX PR. Read the relevant `EventModules.*` flag in the dashboard layout component (probably `src/app/(dashboard)/dashboard/events/[eventId]/layout.tsx` or equivalent), conditionally render each menu item. ~half a day. Not blocking the sweep; not blocking Productive Families (the visible 403s don't break the UI, just noise the console).

---

## Productive Families launch status

- ✅ Logo configured
- ✅ Date/time/venue hidden via data attributes + customCss
- ✅ Product category options configured (20 categories, EN+AR translations)
- ✅ FILE field works end-to-end for visitor uploads
- ✅ Email optional (so synthetic-email visitors can register without an email)
- ⚠️ **Name display in dashboard list shows `Reg #cmpgck5x` instead of real names** — because form fields are named "First Name" / "Middel Name" / "Third Name" rather than the registration endpoint's expected `firstName` / `lastName`. **Blocked on field-mapping feature.**
- ⚠️ **Admin can't fix wrong/missing visitor uploads from dashboard** — Stage 3 UI deferred. Workaround: ask visitor to re-register or fix via Prisma Studio.

Launch is 3+ days out per last check. Field-mapping needs to ship before launch.

---

## Recent decisions and lessons (newest)

- **Smoke-test failure ≠ server bug.** Client and server are both code we wrote. Stage 1 over-stamping diagnosis initially blamed server; real root cause was client over-sending unchanged fields. Always investigate both sides.
- **Diff-gate is the load-bearing invariant for Registration writes.** Server-side, not client-dependent. Self-heals historical CSV drift on first admin save of each row.
- **Spec wording may diverge from codebase enum values.** Stage 2 spec said `"viewer"` for role requirement; code uses `"authenticated"`. Code wins, document the deviation in PR.
- **Single commit for mechanical multi-route changes.** Stage 2's 4-route migration + 3 bonus tightenings was one cohesive security change. Splitting into micro-commits adds review surface without value.
- **Hard-stop discipline for library-internal races.** Pre-committed fallback (revert UI) prevented infinite "let me try one more thing" loop on Stage 3. Three patches without progress is the signal.
- **Admin-UI for Replace can't exist without admin-Upload.** Late-session realization: Mockup 2b's "no buttons in empty state" creates an operational dead end. If admin Removes a required FILE, no path to fix from dashboard. Drove the admin-upload-from-empty feature request.
- **Bug #1's pattern (auth inside `onBeforeGenerateToken`, not handler-top) is load-bearing for any admin upload route.** Webhook has no admin cookie. Must validate tokenPayload aggressively inside `onUploadCompleted` since it's the only trust boundary.

---

## Memory updates Claude Code has saved

- `admin-edit-stage1-complete.md` — CSV-drift fix, diff-gate, dual-store writes
- `admin-edit-stage2-complete.md` — five-route migration, cross-event guard, audit stamping, RoleRequirement enum lesson, single-commit shape
- `admin-edit-stage3-complete.md` — backend services + endpoints + invariants + Bug #1 webhook auth pattern + three failed UI fix attempts
- `radix-dialog-post-refetch-race.md` — standalone race writeup with revival path
- `field-mapping-stage1-complete.md` — schema + API + form-builder UI shipped; resolver (Stage 2) and backfill (Stage 3) standing by
- `field-mapping-stage2-complete.md` — resolver wired; Productive Families new-registration fix live; TS-strict gotcha lesson (tsc --noEmit before push)
- `field-mapping-stage3-complete.md` — feature complete; backfill preview + run + UI live; 10 locked invariants; 4 spec deviations; 2 pre-push diff-review bug catches
- `admin-edit-stage4-complete.md` — audit trail display + arc close-out; contact.updatedAt ↔ updatedBy synchrony invariant for future Contact writers; UserRef leak-surface guidance; time-estimate reframe heuristic for read-only audit features

---

## Files in Project Knowledge

- `specs/PHASE_BASED_FORMS_SPEC.md` — completed feature
- `specs/PHASE_SELECTIONS_SPEC.md` — completed feature
- `specs/ATTENDEE_DETAIL_REDESIGN_SPEC.md` — completed feature
- `specs/CATEGORY_PHASES_SPEC.md` — completed feature
- `specs/TRANSLATION_AND_BULK_OPTIONS_SPEC.md` — completed feature
- `specs/OTHER_AND_MAX_SELECTIONS_SPEC.md` — completed feature
- `specs/FILE_FIELD_SPEC.md` — completed feature
- `specs/EMAIL_OPTIONAL_EVENTS_SPEC.md` — completed feature
- `specs/ADMIN_EDIT_FIX_SPEC.md` — ARC COMPLETE on production (Stages 1, 2, 4); Stage 3 backend live, Stage 3 UI deferred per `[[radix-dialog-post-refetch-race]]`
- `specs/FIELD_MAPPING_SPEC.md` — FEATURE COMPLETE (all 5 PRs shipped: #24, #25, #26, #27, #28)
- `CLAUDE.md` — project conventions
- `prisma/schema.prisma` — current schema
- `PROJECT_HANDOFF.md` — this document

---

## How to start the new conversation

1. Open the Registration System Project on Claude.ai
2. Click "New chat"
3. State what you want to work on:
   - "I want to retry Stage 3 UI (FILE Replace/Remove)" → has diagnosis ready, requires sourcemap setup first (the last outstanding item from the admin-edit-fix arc)
   - "Let's spec admin-upload-from-empty" → smaller feature, requires Stage 3 UI to be working first
   - "Let's do the auth posture sweep" → ~25 legacy-`auth()` handlers across events API, each needs its own audit + role decision; one larger PR
   - "I want to retry Stage 3 UI" → has diagnosis ready, requires sourcemap setup first
   - "Let's spec admin-upload-from-empty" → smaller feature, requires Stage 3 UI to be working first

Claude will read this handoff + the specs + memory and pick up from here without re-asking.

---

*Updated 2026-05-25 after PhaseReceipt cleanup merge. **Admin-edit-fix arc COMPLETE** + **field-mapping feature COMPLETE** + 2 polish PRs shipped same day (Contact GET auth migration + PhaseReceipt cleanup). Next priority: FILE Stage 3 UI retry per queue item #1.*
