# Registration System — Project Handoff

**Last updated:** 2026-06-13 (Attendees-page arc COMPLETE + live — dynamic form-answer filters + filter-aware exports + server-side pagination + bulk delete (PR #53) and URL view-state persistence + scroll memory + numbered pager (PR #54). Also this window: full-codebase review hardening shipped (PR #52 — capacity-race lock, OTP throttle, validation gaps), client-side image compression (PR #50), orphan-blob reconciliation script (PR #51), COUNTRY export fix (PR #49))
**Owner:** Mohanad
**Repo:** github.com/mohanadrashad/registration-system-
**Stack:** Next.js 16, Prisma 6, PostgreSQL on Neon, deployed on Vercel
**Storage — TWO Vercel Blob stores:** (1) **private** store (id `Q7RjwvBaaLwKE6eR`, env `BLOB_READ_WRITE_TOKEN`) — visitor FILE uploads + phase receipts, served via stream-through. (2) **`branding-public`** store (PUBLIC, id `store_O0LBuk4rM0qMcAYL`, env `BLOB_PUBLIC_READ_WRITE_TOKEN` — set in **Preview + Production**) — admin-uploaded logos/favicons, served as direct CDN URLs on the public registration page. A logo isn't secret; the private store rejects `access:"public"` (store-level), which forced the second store.
**Translation:** MyMemory API (free tier, 50k chars/day with email param)
**Branch in progress:** none — between projects (attendees-page arc fully shipped; no queued substantive feature)
**Production branch:** `main`, HEAD at `83cc2c6` (attendees view persistence, PR #54)
**Working directory:** Git worktree at `C:\Users\mohan\AppData\Roaming\warp\Warp\data\worktrees\registration-system\arch-pass`

---

## What this project is

Internal registration platform for La Gloire (Riyadh events/hospitality company). Multi-event, multi-tenant, runs at `registration.itsbader.com`. Productive Families is now **LIVE** on the redesigned registration page (launched 2026-06-03).

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

### 2026-06-13 — Attendees view persistence — URL state + scroll memory + numbered pager — live on prod

Closes three navigation papercuts the maintainer hit using the new filters on the 2,794-attendee event: filters vanished after clicking into an attendee and coming back; scroll position was lost on the round trip; no way to jump straight to page 5 of 20.

**Attendees view persistence** — `83cc2c6` (PR #54, squash merge). 2 files, +192/−22.

- **All view state mirrors into the URL** (filters, form-answer `ff` JSON, search, page, pageSize, sort) via `history.replaceState` — NOT router navigation, so no history spam and no re-render churn. State initializers read `useSearchParams` on mount. Browser back, refresh, and **shared/bookmarked links** all restore the exact view. The page-reset-on-filter-change effect gained a **mount guard** so a URL-restored page number isn't clobbered on load.
- **Scroll + return-URL memory:** row click saves `window.scrollY` + the full list URL to sessionStorage (`attendees:scroll:<eventId>` / `attendees:return:<eventId>`); the list restores scroll once after first data load (key cleared after use); the detail page's **Back button** consumes the return URL instead of the bare `/attendees` default (state+effect read, not render-time sessionStorage — avoids hydration mismatch).
- **Numbered pagination with ellipsis** (`Previous 1 … 4 [5] 6 … 20 Next`) via a small `pageNumbers()` helper; numbers hidden on small screens where Previous/Next remain.
- The statistics deep-link chip's manual URL-strip was deleted — the URL-sync effect now owns the query string.

### 2026-06-12 — Attendees dynamic filters + filter-aware exports + server-side pagination — COMPLETE, live on prod

The big one this window: the Attendees page went from "weak filtering, loads all rows" to professional at 7k+ attendees. Driven by the maintainer's report on the 2,794-organizer event ("can't filter by city/gender/nationality; every event has different fields"). Squash-merged `198f77c` (PR #53, two commits: filters `d0b9df4` + pagination `44f98d9`).

**Commit 1 — dynamic form-answer filters + filter-aware exports:**

- **Filter set is DERIVED from each event's own form** — never hardcoded columns. New shared module `src/lib/attendees/attendee-filters.ts`: `getFilterableFields` (active REGISTRATION-phase `SELECT/RADIO/MULTISELECT/COUNTRY/CHECKBOX` fields), `parseFieldFilters` (client sends one `fieldFilters` JSON param `{fieldName: value}`; unknown keys dropped server-side — no arbitrary JSON-path probing), and `buildContactWhere` — **the single where-builder shared by the attendees list route AND `registrations/export`**. That sharing is the load-bearing invariant: **"what you see is what you export"** holds by construction. Any new attendee filter must be added in the module, not inline in either route.
- Predicates run server-side against `Registration.formData` JSON paths: string `equals` (SELECT/RADIO/COUNTRY), `array_contains` scalar (MULTISELECT), boolean equals (CHECKBOX, sent as `"true"/"false"`). All three **verified live against the dev DB** before ship.
- UI: **Filters** popover (one Select per field; Radix typeahead makes the 195-country list searchable by typing), active-count badge, removable chips + Clear all. COUNTRY/CHECKBOX options resolve client-side (server sends empty options for them); option-bearing fields include the `__other` entry.
- Export (CSV + Excel) accepts the same params — filter to "women from Riyadh", hit Export, get exactly those rows. No params = full dump, unchanged. Export reuses the contact-where as `{eventId, contact: {is: contactWhere}}`.

**Commit 2 — server-side pagination + bulk ops (the 7k-attendees performance ask):**

- Previously the API returned **every** matching contact on each filter change (multi-MB per keystroke at 7k) and the client paginated. Now: `page`/`pageSize` (capped 100) with `skip`/`take`; status counts via `groupBy` aggregates; "Emailed" sort server-side (`emailLogs: {_count}` ordering); meta (event/templates/phases) fetched **once** via `includeMeta=1`; "Select all N" fetches just ids via `idsOnly=1`.
- **New `POST contacts/bulk-delete`** — the old loop fired **one DELETE per contact** (7k selected = 7k sequential requests). Now one transaction: manager role, eventId-scoped `deleteMany` (eventId in every where doubles as the cross-event guard), same cleanup order as single DELETE (emailLogs → registration → contact), zod-validated ids (max 10k).
- **Stale-response guard** — fetch sequence counter; a slow earlier response can never overwrite a newer one (latent race in the old code, now impossible). Table dims + paging buttons disable while loading; failed loads toast.
- The attendees API has exactly ONE consumer (the page) — response-shape change verified safe by grep.
- **Prisma `groupBy` gotchas (for the next aggregate):** it REQUIRES `orderBy` when used in the `$transaction` array form, and its `_count` payload types as a wide union (`true | {…} | undefined`) — normalize defensively.
- Verified live against dev DB: page slicing with zero overlap between pages, groupBy counts, email-count ordering. Memory `[[attendee-field-filters]]`.

### 2026-06-12 — Full-codebase review hardening — 15 fixes across 14 files — live on prod

First exercise of the new model ("try the Fable capability"): 5 parallel subsystem reviews (registration flow, portal, admin API, services, dashboard UI), **every finding hand-verified against the code before fixing** — two agent claims were rejected as false positives. Squash-merged `2d93b0d` (PR #52). Memory `[[full-codebase-review-2026-06]]`.

**The big one — capacity oversell race.** `determineRegistrationStatus` ran BEFORE the registration transaction; two concurrent submits could both read "one spot left" and both confirm past capacity. Same race in admin approve and waitlist promote. **New `approvalService.lockEventRow(tx, eventId)`** (`SELECT … FOR UPDATE` on the Event row) + capacity decisions moved inside the locked transaction in all three paths; `reject()` wrapped in a tx too (its two writes could half-apply); `getCapacityInfo`/`determineRegistrationStatus` accept an optional tx client. **Contract for future work: ANY capacity-deciding write path must take the lock.** `getCapacityInfo` also collapsed 4 queries → 2 (groupBy).

**Other correctness:**
- Required CHECKBOX `false` passed validation client + server (and `[]` for required MULTISELECT server-side) — both rejected now.
- Register POST stored the **entire client JSON body** into `Registration.formData`/`Contact.metadata` — now filtered to real form keys (+ `__other` siblings + legacy keys); malformed JSON → 400 not 500.
- **Portal OTP email bombing closed:** successful code requests were never rate-limited (anyone knowing a registered email could flood the inbox, invalidating the victim's codes each time). New per-(event,email) throttle — 30s cooldown, 5/15min, **recorded for every request so the 429 carries no enumeration signal**. Also: synthetic emails never generate codes or hit SMTP; `timingSafeEqual` hash compare; transport failure no longer 500s.
- users routes: zod validation (email/role enum/password min 8), P2025→404, P2002→409, **self-role-change guard** (mirrors the self-delete guard — prevents the last SUPER_ADMIN locking everyone out). form-fields/reorder validates shape + duplicate ids/orders.

**UX:** public register form got try/catch around submit (network drop = bilingual error instead of infinite spinner; non-JSON error bodies no longer mask outcomes); badges/templates/checkin-search silent failures now toast; approvals approve/reject/promote `await` the silent refetch (closes a fast-double-click double-fire window).

**Rejected findings (do NOT re-fix):** form-fields `[fieldId]` PATCH cross-event claim is FALSE (the handler verifies `{id, eventId}` before updating); the OTP "timing attack" was overstated (HMAC compare — hardened anyway as a one-liner).

**Verified-but-deferred (user decided "skip for now"; triggers documented in the queue below):** raw `confirm()` dialogs (6 files), role-blind action buttons on badges/whatsapp/checkin/form-builder pages, phase-reminder partial-failure retry, smtpPort validation, bare loading states / date-format inconsistencies.

### 2026-06-11 — Blob quota incident response: image compression + orphan-blob script (separate session)

Production uploads started failing — the private Blob store hit the Hobby-plan 1GB cap, masked by `describeUploadError`'s catch-all "connection lost" message (the real `400 Storage quota exceeded` was only visible in the DevTools response body). Resolution: plan upgraded to Pro + two PRs.

- **Client-side image compression** — `a3ac9e4` (PR #50). `maybeCompressImage()` in `file-upload-control.tsx`: images >400KB downscale to 1800px long edge, JPEG q0.82 (~5–10× smaller, national-ID small print stays legible). **Exempt:** PDFs, small images, HEIC/HEIF (canvas can't decode). Only converts format when `allowedMimeTypes` permits; falls back to original on any failure; never throws. Memory `[[upload-image-compression-shipped]]`.
- **Orphan-blob reconciliation script** — `70c19b5` (PR #51). `prisma/scripts/cleanup-orphan-blobs.ts` (334 lines): lists store blobs vs DB references, dry-run by default, **aborts if the DB references 0 blobs or <50% of a non-empty store** (`--force` to override). That guard exists because of a near-miss: **the local `.env` `DATABASE_URL` is a DEV DB while the local Blob token points at the PROD store** — a naive reconciliation sees prod blobs + dev DB and flags every real attendee file as an orphan. Run ONLY against the production `DATABASE_URL`. Memory `[[blob-stores-and-dev-db-footgun]]`.
- Open prevention follow-up: confirm `CRON_SECRET` is set in Production so the nightly orphan-receipt cron actually runs.

### 2026-06-08 — COUNTRY export fix (PR #49)

`fix(export): resolve COUNTRY field codes to full names` — `a8d86f4`. COUNTRY fields store the ISO-2 code (e.g. `SA`); the CSV/Excel cell now resolves to the full name via the `COUNTRIES` list (matches what the dashboard shows) instead of dumping the raw code. Lives in the export route's `formatCell`.

### 2026-06-08 — Excel attendee export — clickable FILE links + form-aware columns — COMPLETE, live on prod

The Attendees page now has an **"Export as Excel"** button **alongside** the existing CSV "Export" button (CSV unchanged — byte-identical). The xlsx renders each attendee-submitted FILE field as a **clickable cell** linking to the file. Squash-merged `6218bed` (PR #48). One route + the button changed; rides entirely on existing infra.

**Excel export with FILE hyperlinks** (`registrations/export` gains a `format=xlsx` branch; the route already accepted `?format=`):
- Built with **SheetJS** (`xlsx`, already a dep — previously only used for *import*). Same rows as CSV (reuses `formatCell`), explicit column order.
- Each FILE field cell is a real hyperlink (`ws[addr].l = { Target, Tooltip }`): the cell text stays the filename, the Target is the **absolute** url `${origin}/api/events/${eventId}/files/${fileId}/stream` (origin from `new URL(req.url).origin`), tooltip "Open file (admin login required)". `fileId` was always present in `formData` (`{fileId,filename,mimeType,sizeBytes}`) — just unused before.
- One column/link **per FILE field**, never merged.
- **Admin-only, no public exposure:** the link points at the existing admin-auth-gated stream route (`authorizeEvent`), which streams the **private** blob. Opens cleanly for a logged-in admin; **401 without a live session** (verified). So: **NO new public Blob store, NO new endpoint, NO schema change, NO new env.**
- **SheetJS gotchas (for the next binary export):** `XLSX.write(..., {type:"array"})` then `new NextResponse(new Blob([buf]))` — a bare Buffer/Uint8Array trips the strict `BodyInit` generic under this TS lib config. Hyperlink writing is community-version (not Pro).

**Form-aware base columns** (folded into the same PR — was hardcoded; empty Organization/Designation etc. cluttered forms that don't collect them):
- **First Name + Last Name** always pinned (identifying column never vanishes); **Category / Status / Registered At / Confirmation Code** always (admin-set/system).
- **Email / Phone / Organization / Designation** appear only when the form **DEFINES** the field — an active FormField with `mapsTo` = that role **OR** a legacy field literally named the column (`FULL_NAME` feeds First+Last). Gated on form-*definition*, never on batch data, so a **defined-but-unanswered** field still gets its column. Added `mapsTo` to the export's `select`.
- One `baseColumns` source feeds **both** CSV and xlsx → the column **set is identical across formats**.

**Smoke (Playwright + SheetJS/Papa parse, real forms + a controlled throwaway event):** 6/6 FILE cells linked to correct per-file stream URLs (incl. an Arabic filename), two FILE fields land in two distinct linked columns, CSV still `text/csv` with plain filenames and no links, unauth stream → 401; Event A (no org/designation mapping) drops both columns, an email-optional form drops Email, a defined-but-unanswered ORGANIZATION field keeps its column, First/Last/Category/Status/Confirmation always present, CSV header set === xlsx header set. Memory `[[csv-export-routes]]`.

**⚠️ Known item — NOT addressed (out of scope, pre-existing, logged):** a FormField mapped to a contact role but **named differently** (e.g. `company` → `mapsTo:ORGANIZATION`) shows as **two columns** — the base "Organization" column (resolved value) AND its own dynamic "Company" column (raw answer), same value duplicated. Cause: the dynamic-field exclusion (`CONTACT_COLUMN_NAMES`) is **name-based**, not mapping-based. Forms that name the field literally (`organization`) don't hit it. **Fix sketch for a future ticket:** exclude dynamic fields whose `mapsTo` targets a base column, not just those whose `name` matches.

### 2026-06-08 — Auth posture sweep — TRULY complete (the 2026-06-01 "ARC COMPLETE" was auth()-only)

The 2026-06-01 sweep declared "zero legacy `auth()` call sites remain" — **but that was verified for `auth()` / `@/lib/auth` only.** Its audit grepped for `auth()` and never enumerated the OTHER legacy helper: global **`authorize()`** from `@/lib/api-auth`, which checks **global role only, NO per-event `EventMember`** (its signature takes no `eventId`). **8 `[eventId]` handlers (~15 handlers) were still on it** — including one with a live cross-event data-isolation bug. Surfaced when asked to "do the auth sweep" off the handoff's stale how-to-start line. Two PRs closed it; with these, `authorizeEvent` is *genuinely* canonical across `/api/events/[eventId]/*` (only the correctly-global `events/route.ts` collection — list/create events — still uses `authorize()`).

**Inventory:** 65 `[eventId]` route files, **zero unguarded**, exactly 8 on global `authorize()`.

**PR A — mechanical migration** — `c45d3e8` (PR #46, squash merge). The 6 files with NO data-layer gap, `authorize(...)` → `authorizeEvent(eventId, {role})`, **roles preserved exactly**, params extracted before the auth call:
- `[eventId]/route.ts` (GET authenticated · PUT editor · DELETE manager)
- `modules/route.ts` (GET authenticated · POST editor · PATCH manager)
- `form-fields/route.ts` (GET authenticated · POST editor) — **the collection route PR #32 missed** right beside the `[fieldId]` route it fixed
- `badges/generate` (POST editor), `badges/send` (POST editor), `emails/campaigns/[campaignId]/send` (POST editor, orphan)
- Dropped one genuinely-redundant bare-existence `findUnique` (modules POST → reuse the event `authorizeEvent` already loads/404s). The `[eventId]` GET keeps its own query — it needs the `_count` include `authorizeEvent` doesn't load (so it was 1 cleanup, not 2).

**PR B — cross-event DATA isolation (the security half)** — `1c95157` (PR #47, squash merge). The 2 files with the **dual-gap** (auth-helper AND data-layer, the PR #32/#36 class):
- 🔴 **`emails/templates/[templateId]` GET/PUT/DELETE** — were keyed on `templateId` with **no `eventId`** (`findUnique`/`update`/`delete where:{id}`). **Any global editor (member of any event) could read, edit, or delete ANY event's email template by id — live in production until this PR.** Now: `authorizeEvent` + `findFirst`/guarded-`update`/`deleteMany` all scoped to `{id, eventId}` (404 on cross-event; `update`'s pre-check is TOCTOU-free because a template's `eventId` never changes).
- 🟠 **`attendees/send-email`** — the template lookup (`templateId` from the request body) was unscoped, letting an editor on this event render+send ANOTHER event's template content. Now `findFirst({id: templateId, eventId})`. **Stays at editor.**

**Pre-flight (gated PR B):** re-ran `prisma/scripts/preflight-event-auth-sweep.ts` (new, committed in PR A; mirrors `preflight-branding-auth.ts`) against **production** (host `ep-wandering-union`): **1 SUPER_ADMIN, 2 VIEWER, 0 non-SUPER_ADMIN global EDITOR/MANAGER → PASS** (the migration removes nobody's access; the 1 SUPER_ADMIN bypasses `authorizeEvent`, VIEWERs can't write). PR A is mechanical/low-risk and shipped ahead of the pre-flight per the human decision; the access-change math is identical so the script covers both.

**Email-send routes stay at `editor`.** `badges/send`, `attendees/send-email`, and `emails/campaigns/[campaignId]/send` all send real email at `editor` — a distinct (external, can't-be-unsent) threat model. Deliberately NOT bumped to manager here: that's a separate, deliberate permissions decision, not part of this auth-tightening.

**Smoke (Playwright, real dev server).** PR A: SUPER_ADMIN still 200 on migrated GETs + 400 no-op on a manager-gated PATCH; a non-member global EDITOR now gets 403 `NOT_EVENT_MEMBER` on reads AND the mutation (was 200) — gap closed, no member-caller regression. PR B (dual-gap, per `[[auth-migration-audit-pattern]]` — verify the gate AND the row scoping): an EDITOR member of Event A only, vs Event B's template — GET A/own 200 + PUT A/own 200 (no regression); GET/PUT/DELETE A with **B's template id** → 404 with DB checks confirming B's template was **neither mutated nor deleted**; GET B/<B template> → 403 (auth gate); send-email on A with B's template → 400 "not found", no send. Memory `[[auth-sweep-followup]]`.

### 2026-06-07 — FILE admin file-ops arc — COMPLETE, live on prod (queue #1 + #2 closed)

The whole dashboard file-management story for FILE fields is now real: admins can **View / Replace / Remove** a visitor's uploaded file, **upload a new file into an empty field**, and see **provenance** (who uploaded, when, replaced-or-not) — all from the attendee detail page. Two merges this session, plus a production-race fix found on Preview.

**FILE Stage 3 UI — Replace/Remove + provenance** — `76527aa` (PR #44, squash merge). The UI reverted from admin-edit Stage 3 (PR #23) over the "Radix race," rebuilt clean. Closes the last outstanding item of the admin-edit-fix arc.

- Backend (services + replace/remove/meta endpoints) was already live from PR #23; this wired the UI into `FieldEditInput`'s FILE branch via a new `FileFieldEditCell`.
- **Applied the PR #39 stable-DOM template verbatim:** every conditional placement always-mounted + CSS-`hidden`-toggled (the `file?…:<p>No file>` ternary, size/mime spans, in-button Loader2s, dialog "current file" + required lines, provenance as one always-mounted `<p>`). The post-action refetch flips the cell value (object→null on Remove, object→object on Replace) with nothing unmounting, so the closing Dialog's Presence exit + toast portal have no sibling teardown to race. The discredited 250ms `setTimeout` buffer is gone.
- Plumbing: page → `RegistrationAnswersCard` → `FieldEditInput` now forwards `contactId` + `onFileChanged` (= the page's `fetchContact`). The orphaned `/meta` endpoint now backs the provenance line.
- **Diagnostic discipline that finally worked:** smoke-tested headlessly with Playwright against `npm run dev` (Turbopack sourcemaps) + `pageerror`/`console.error` capture — Remove (object→null, with-sibling AND last-and-only), Replace (object→object). Zero commit-phase DOMExceptions. Memory `[[file-stage3-ui-complete]]`.

**admin upload-into-empty** — `9275958` (PR #45, squash merge; feature `d3a79e8` + race fix `0764def`). Lets an admin upload a NEW file into a FILE field that's currently empty (after a Remove, or a visitor who never uploaded) — closes the operational dead-end the Stage 3 work surfaced. No schema change.

- **New `POST /api/events/[eventId]/contacts/[contactId]/fields/[formFieldId]/upload`** — keyed on `formFieldId` (an empty field has no fileId), mirrors the replace route's `handleUpload` webhook pattern (auth INSIDE `onBeforeGenerateToken`).
- **`validateAdminUploadTarget`** — walks contact → registration (1:1) + formField; rejects registration-less contacts (v1 hides the Upload button; auto-create is a v2 non-goal) and enforces the **empty-field guard**: a non-empty field rejects with "This field already has a file — use Replace instead." (keeps Upload/Replace disjoint, blocks double-write).
- **`completeAdminCreateFile`** — insert-only sibling of `completeAdminReplaceFile` (no old row/blob). Shared dual-store write (`Registration.formData` + `Contact.metadata` + `updater` stamp) factored into **`writeFileRefDualStore`**, now used by create / replace / remove.
- **Distinct `admin-new:<id>` provenance sentinel** (vs replace's `admin:<id>`) → `getAdminFileProvenance` returns `wasReplaced:false` → the provenance line reads "Uploaded by &lt;admin&gt; on &lt;date&gt;" WITHOUT the "(replaced visitor upload)" clause for admin-created-into-empty files.
- Frontend: Upload button in the cell's always-mounted no-file block, `Pending` union += `"upload"`, a second always-mounted hidden `<input>`, all CSS-hide discipline, no Dialog (upload-into-empty is non-destructive). `FormFieldDef` gained `id` (the URL key; added to the contact GET select). Memory `[[admin-upload-empty-complete]]`.

**Webhook-timing race fix (the important one)** — `0764def`, bundled into PR #45. **Found on Preview, was live-in-prod-silent for Replace:** `@vercel/blob` `upload()` resolves when bytes hit storage, BEFORE the `onUploadCompleted` webhook persists the RegistrationFile row + dual-store refs — so the single immediate `onFileChanged()` refetch read **stale/empty** data. Upload showed "No file uploaded" until a manual refresh; **Replace silently showed the OLD file, looking like success.** (Remove is unaffected — synchronous DELETE handler, no webhook.)

- Fix mirrors the visitor-side `waitForUploadedFile` (`file-upload-control.tsx`): after `await upload()`, **poll** a new read-back endpoint until the field reflects the new file, THEN settle — not one immediate refetch, not blanket auto-refresh.
- New `GET .../fields/[formFieldId]/file` + `getAdminCurrentFile`. `waitForFieldFile` polls 12×800ms (~10s); Upload waits for any ref, Replace for a *different* fileId (the webhook swaps old→new atomically). Spinner stays up through the poll.
- **Timeout state:** if the window elapses, a persistent always-mounted (CSS-hidden) amber "your file was sent but is taking longer than usual — refresh to check" — so a lost race never reads as success.
- Verified clean on **Preview against the real webhook** (Upload + Replace show the file, no manual refresh, no stale flash) before merge. See the lesson below.

### 2026-06-04 — Registration customization Feature B — COMPLETE, live on prod (spec fully shipped)

Per-field control over the MULTISELECT card-grid column count. Squash-merged `46a99eb` (PR #43). Spec `specs/REGISTRATION_CUSTOMIZATION_SPEC.md` §6 — **with this, Feature A + B are both done and the customization spec is fully realized.**

- **Schema:** `enum OptionColumns { AUTO ONE TWO }` + `FormField.optionColumns @default(AUTO)` in the Layout group (additive, defaulted — no backfill; existing fields stay AUTO = today's responsive 1→2). Pushed to staging (Preview `vercel-build`) + production (maintainer credential step).
- **Renderer:** static `OPTION_COLS` literal map at the MULTISELECT grid (no interpolation, so Tailwind JIT emits the bare `grid-cols-2`) — AUTO → `grid-cols-1 sm:grid-cols-2`, ONE → `grid-cols-1`, TWO → `grid-cols-2` (incl. mobile). Guardrails: `minmax(0,1fr)` + 640px shell cap already existed; **added** `h-full` on the card button + the at-max Tooltip wrapper span (equal-height) and `break-words` → `[overflow-wrap:anywhere]` on the label.
- **Plumbing:** register GET DTO, public `FormField` interface, `form-fields` POST (default AUTO) + PATCH (validate) + `optionColumnsSchema` Zod, and an Option Columns select in the form-builder add + edit dialogs (MULTISELECT-only, after Field Width).
- **`overflow-wrap:anywhere` is the one change touching existing fields** (all MULTISELECT grids, not just new TWO) — smoke-tested on Preview against Productive Families' 20-category `business_activity` field; wrapping is clean. Verified post-deploy: prod register API returns `optionColumns` (no schema-mismatch).
- **Per-field VALUE is data, not code:** the Preview-set `business_activity` columns choice wrote to **staging**, not prod, so after merge the prod value defaulted to `AUTO`. It was **re-set to 2 columns on the production form-builder and verified on the live page** (2026-06-04). (See the lesson below for the general rule.)

### 2026-06-03 — Registration customization Feature A — COMPLETE (Stages 1+2+3), live on prod

Per-event header & logo customization for the redesigned registration page. Merged as one squash commit `5ab3977` (PR #42) after shipping in three stages on `header-layout-controls`. Spec: `specs/REGISTRATION_CUSTOMIZATION_SPEC.md` (§5, Feature A). Verified end-to-end on prod: register API returns the new columns (no schema-mismatch 500), Productive Families renders unchanged on defaults.

- **Stage 1 — schema + renderer + API.** `EventBranding.headerColor String?` / `headerShowLogo Boolean @default(true)` / `logoHeight Int?` (additive, nullable/defaulted, no backfill — applied to staging + production Neon via `db push`). Public renderer: header bg = `headerColor ?? "#0c0c0e"`; **auto-contrast** text from header luminance (new `src/lib/color-contrast.ts`, replaces the hardcoded `text-white`); dark/light-aware logo pick; `headerShowLogo=false` = hard switch to event-name text; `logoHeight` as **max-height** (clamped 24–80). New `src/lib/validations/branding.ts` Zod. Plumbed through the public `Branding` interface + register GET projection.
- **Stage 2 — admin Header card + auth migration.** Header card in the Colors tab (color picker + presets, Show logo / event-name switch, size slider, live preview, white-logo-on-light warning). Header Image URL relabeled "Legacy · not used" (column kept). Branding API migrated global `authorize()` → `authorizeEvent({role})`, gated on a production pre-flight (`prisma/scripts/preflight-branding-auth.ts`: 0 non-SUPER_ADMIN global editors → nobody's access changes).
- **Stage 3 — upload-instead-of-link.** Authenticated `POST /api/events/[eventId]/branding/upload` → `put({access:"public", token: BLOB_PUBLIC_READ_WRITE_TOKEN})` to the new public store, returns the CDN URL stored in the existing `logoUrl`/`logoWhiteUrl`/`faviconUrl` column via the normal Save. Reusable `BrandingImageField` (upload + progress + preview); paste still works. **No visitor client-token flow** — plain authenticated server route. Gated on `prisma/scripts/public-put-smoke-test.ts` (proved public put is directly fetchable). **Required a second, public Blob store** — Stage 0's one-store assumption was wrong (access is store-level; the private store rejects `access:"public"`).

**New infra:** the `branding-public` Blob store (see Storage note in the header) + `BLOB_PUBLIC_READ_WRITE_TOKEN` in Preview + Production.

**Outstanding:** rotate the staging + production Neon passwords and the `branding-public` blob token (all surfaced in plaintext during setup). Minor: upload-then-leave-without-Save orphans a small public blob (no cleanup job).

### 2026-06-03 — Productive Families LIVE + customization spec committed

Status-tracking session — no application code shipped. The substantive outcomes are the launch confirmation, the name-display verification, and a new spec committed to `main`.

- **Productive Families is LIVE** on the centered-card redesigned page (`registration.itsbader.com`). The redesign Stages 1+2 (PRs #40, #41) are now serving the real launch.
- **Name display confirmed resolved.** Field-mapping (PRs #24–#28) is complete and PF's form fields are tagged (First Name → FIRST_NAME; Middel Name + Third Name → LAST_NAME). Dashboard verified — **4/4** existing rows show real names, zero `Reg #...` fallbacks. The long-standing "blocked on field-mapping" caveat is closed.
- **`logoWhiteUrl` configured** for PF (`i.imgur.com/POuPyxt.png`) — the white LA GLOIRE logo renders on the dark header strip; no event-name-text fallback.
- **New spec committed:** `specs/REGISTRATION_CUSTOMIZATION_SPEC.md` (`f2fcbe5`, standalone docs commit to `main`). Covers **Feature A** (admin header & logo controls) + **Feature B** (per-field option columns). Specced, not started — the next queued substantive feature now that PF has launched. The broader template system stays deferred as a separate future project.

### 2026-06-02 — Registration page redesign — FEATURE COMPLETE (Stages 1 + 2)

Visual restyle of the public registration page into La Gloire's brand language. Centered white card on a soft-gray page with a dark branded header, gradient accent line, crisp fields with a green focus ring, and a 2-column MULTISELECT card grid. Shared renderer — every event benefits automatically. Spec: `specs/REGISTRATION_REDESIGN_SPEC.md` (also committed this session).

**Stage 1 — Centered-card shell + crisp field styling** — `0e8b72f` (PR #40, squash merge). Bundles the spec doc + the gitignore chore + the shell/field work; ~+283 / -369 net on `src/app/(public)/register/[eventSlug]/page.tsx`.

- Replaced `lg:grid lg:grid-cols-2` split-panel with a centered `max-w-[640px]` white card. Dark `#0c0c0e` header strip carries `logoWhiteUrl` (fallback `logoUrl`, fallback event-name text); 3px green→magenta gradient accent line beneath.
- Both shells (form + success) restructured via a shared `renderCardShell` helper — the page never changes shape between submit and success.
- Extracted `INPUT_CLASSES` + `SELECT_TRIGGER_CLASSES` constants, applied to all 9 input/textarea/date-time/select callsites — white bg, `#e3e4e8` border, 11px radius, 46px height, green focus ring (`#7EC43F`).
- Submit + Next buttons themed off `primaryColor → secondaryColor` with green→magenta fallback. Back stays outline.
- Plumbed `logoWhiteUrl` through the public `Branding` interface + the `api/register/[eventSlug]` GET selection (column already existed in `prisma/schema.prisma`; only the public read-path was missing).
- Event-meta row preserved its exact `[data-event-date]`, `[data-event-time]`, `[data-event-venue]` attribute selectors — per-event customCss (Productive Families hides the meta this way) keeps working.

Mid-stage tweak (user feedback on Preview): card max-width widened from spec's 460px to 640px — too cramped on desktop for 2-col field rows. Single-edit fix in the shared helper, both shells widened together.

**Stage 2 — MULTISELECT 2-col card grid** — `7732b46` (PR #41, squash merge). 1 file, +37 / -13.

- Container switched from `flex flex-wrap gap-2` (pill wall) to `grid grid-cols-1 sm:grid-cols-2 gap-2` (1-col narrow mobile, 2-col from `sm:` up).
- Local `renderPill` → `renderCard`: bordered card, leading 16px radio dot + label, `rounded-[11px]`. NO per-option icons (options data has no icon field; deferred to a separate spec).
- Selected state themes off `primaryColor`: border + filled dot in `primaryColor`, background tint via 8-digit hex `${primaryColor}1a` (~10% alpha) so the tint always matches the border.
- Preserved exactly: `maxSelections` clamping (selected cards never disabled), at-max Tooltip wrap, `showSelectionCounter` gate + copy, "Other" card + conditional `OtherTextInput`, Other-deselect-clears-sibling-text, symmetric single/multi-select toggle.

**Key spec deviation (codified in `[[spec-literal-vs-event-theming]]` memory):** Stage 2 spec wrote the selected card state in literal hex (`#7EC43F` border, `#f4faec` tint, green dot). User explicitly overrode to use `primaryColor + alpha-derived tint` instead — hardcoding green would regress per-event theming on a large prominent control for every event whose `primaryColor` isn't green. Productive Families (`primaryColor #7EC43F`) renders identically to the mockup. The general principle: spec literals on event-themed surfaces should be flagged as deviation questions before implementing.

Other locked deviations (5 total): card width 640px not 460px; header strip falls back to event-name text when no logo configured; `headerImage` retired from the public page (still in schema/admin/DTO); Next button gets gradient alongside Submit; stepper kept its existing styling (already matched the new aesthetic).

**Also this session:** `.claude/settings.local.json` removed from tracking and added to `.gitignore` (was repeatedly showing as modified and blocking rebases — see commit `16cae78`, included in the Stage 1 PR squash). `specs/REGISTRATION_REDESIGN_SPEC.md` committed under `specs/`.

Memories saved: `[[register-redesign-complete]]` (feature summary + 5 locked deviations + retired surfaces), `[[spec-literal-vs-event-theming]]` (the deviation principle for future spec reads), `[[branch-cleanup-gh-api-delete]]` (codifies the squash-then-`gh api -X DELETE` workflow that's been muscle memory).

### 2026-06-02 — Three-phase placement-race fix on approvals page — CLOSES deferred "Radix race" investigation

Closes the investigation deferred from Admin-Edit-Fix Stage 3 (PR #23), which hit a hard-stop on 2026-05-23 after 3 patch attempts at the wrong layer. The "Radix Dialog race" diagnosis was wrong — vendor-chunk obscured production stacks made React's reconciler look like a Radix internal. **Real cause:** React choking on conditional placement mutations (mount / unmount / component-type swap) during a commit already busy with a toast portal mount.

**Approvals placement-race fix** — `80c3523` (PR #39, squash merge). 1 file, +108/−77.

**Diagnostic breakthrough:** local repro with `next dev` (Next.js 16's Turbopack default, emits readable sourcemaps for vendor chunks) → DevTools showed the full stack from `react-dom-client.development.js` commit phase, NOT Radix. The "don't patch without sourcemaps" lesson from the 2026-05-23 hard-stop was validated — the real cause was visible in one inspection once the diagnostic environment was right.

**Three-phase fix — 12 placement sources eliminated:**

| Phase | Sources | Pattern |
|---|---|---|
| **Phase 1** (insertion race) | silent refetch + `(b)` draft guard + #1/#2/#3/#6 + Refresh TS catch | Capacity-card conditional renders + `setLoading(true)` page-tree collapse |
| **Phase 2** (deletion race — list empty-states) | #4/#5/#7/#7b | `{list.length === 0 ? <p/> : <Table/>}` empty-state ternaries |
| **Phase 3** (deletion race — per-row content) | #8/#9/#10/#11 | Per-row Loader2 ↔ label content swaps + `index === 0` structural mounts on list shifts |

**KEY INSIGHT:** phases 2 and 3 races were ALWAYS present but MASKED by phase 1's `setLoading` page-tree-collapse which unmounted everything in one mass operation that absorbed the smaller races. Fixing phase 1 unmasked them — phases ship together as a unit. Each subsequent phase was caught by smoking the next action path after the previous phase shipped (phase 2 caught when last-row Approve failed; phase 3 caught when multi-row Approve failed). Source #11 was caught BY REASONING during the phase-3 audit — `{index === 0 && ...}` "structural" gates STILL flip on list shifts.

**Fix pattern:** stable DOM is the antidote. Replace every conditional placement with attribute/className mutation. Always-mount both branches; CSS-hide the inactive one. What's left mounting on action handlers: only the irreducible toast portal (sonner), intentional Radix Dialog Presence (open/close), and atomic key-based row reconciliation.

**Reusable template for FILE Stage 3 UI retry (queue item 1).** The deferred Replace/Remove buttons + provenance UI from PR #23 almost certainly suffers all three phases. The four-step template:
1. Apply silent refetch (`opts.silent` parameter on the parent's refetch)
2. Audit ALL action paths — not just one (the phase-1-only mistake)
3. Stabilize every conditional mount / component-type swap with CSS-hide
4. Smoke each action including last-row + multi-row + dialog paths

Verified on both local dev (Turbopack) and Preview deployment (production-like bundling) — zero DOMExceptions across all action paths. Memory `[[radix-dialog-post-refetch-race]]` updated with full three-phase diagnosis + the COMPLETE PRINCIPLE.

**UX bonuses (independent of race fix):**
- Refresh button no longer collapses the page; refreshes data in place
- User's in-progress capacity edit no longer wiped on action refetches

### 2026-06-02 — Module-gated sidebar UX (auth-sweep follow-up)

Resolves the latent UX gap surfaced by the auth posture sweep close-out (yesterday's queue item). Sidebar menu items for WhatsApp, Check-in, and Email Config now hide when their corresponding `EventModules.X` flag is `false` on the current event. No more console-noise from clicks into pages for disabled modules.

**Module-gated sidebar UX** — `9b938f5` (PR #38, squash merge). 5 files, +60/−15.

Infrastructure was half-built before this PR: the Sidebar declared a `module?: string` field on each nav item with the comment `// will be filtered based on enabled modules`, but the filter logic was never applied. PR #38 connects the wires via a module-level `ENFORCED_MODULES = new Set(["checkIn", "whatsApp", "customEmail"])`. Data flow: per-event Server layout fetches `EventModules` alongside membership, passes through `DashboardShell` → both `Sidebar` (desktop rail) and `Topbar` (mobile drawer wraps the same Sidebar component).

**Approvals intentionally excluded** from the filter — sidebar already declared `module: "approvalWorkflow"` but the auth sweep didn't add an API gate, so hiding the menu while sub-pages remain reachable by direct URL would be a half-measure. Activation breadcrumb in the sidebar comment notes that a future PR adding API-level `approvalWorkflow` gating just needs to add the key to `ENFORCED_MODULES` — the existing sidebar declaration on the Approvals item will activate automatically.

**Smoke-driven amendment**: `router.refresh()` added to the Modules settings page toggle handler success branch. Smoke surfaced that the original 4-file change correctly filtered on layout render but required a manual page reload after toggling a module. The 3-line amendment re-fetches the server-side `EventModules` so the sidebar updates immediately. Failure branches don't refresh. Demonstrates the standard discipline working: pre-push diff review approved the original scope, Preview smoke caught the polish-issue, PR amendment closed it before merge.

Test Event 2026 drift surfaced during pre-flight (1 `PENDING_APPROVAL` row on an event with `approvalWorkflow = false`) but not addressed by this PR — `approvalWorkflow` is excluded from the filter anyway, so the menu stays visible and the data stays reachable.

### 2026-06-01 — Auth posture sweep — ARC COMPLETE (6 of 6 PRs shipped)

> **⚠️ Correction (2026-06-08):** "ARC COMPLETE" / "zero legacy `auth()` call sites" below was scoped to **`auth()` / `@/lib/auth` only** — the audit grepped for `auth()` and never enumerated the OTHER legacy helper, global `authorize()` from `@/lib/api-auth` (global role, no per-event membership). 8 `[eventId]` handlers were still on it, incl. a live cross-event template read/edit/delete. Closed 2026-06-08 by PR #46 + #47 (see the top entry). Lesson: when verifying a migration is "done," grep for ALL legacy patterns, not just the one the sweep is named after.

The auth posture sweep is closed. Six PRs migrated **34 handlers** across `/api/events/[eventId]/*` from legacy `auth()` to `authorizeEvent`, closed **2 cross-event isolation bugs** (one auth-helper layer, one data layer), and introduced or normalized **4 module gates**. Zero legacy `auth()` call sites remain in the surface — verified by grep on the final merge commit (`7c5ebfe`).

**Final PR — Domain + email-settings auth migration** — `7c5ebfe` (PR #37, squash merge). 9 handlers, 5 files, +29/−87 (−58 net). Biggest cleanup of the sweep. Introduces `customEmail` module gate (all 5 email-settings handlers, new enforcement) and normalizes `customDomain` (2 handlers via inline-check collapse, 2 via new gate addition). Drops 2 redundant `prisma.event.findUnique` lookups in `domain` GET + POST per the PR #34 precedent. Pre-flight cleared both gates (0 affected events on prod).

**Sweep close-out table:**

| PR | What shipped | Handlers | Notable |
|---|---|---|---|
| #32 | `form-fields/[fieldId]` cross-event isolation | 2 | 🔴 Security finding — auth-helper layer |
| #33 | Statistics + Registrations reads | 4 | First pure-mechanical PR |
| #34 | Misc admin + `contacts/import` role tightening | 8 | Closes PR #30 deferral; first dead-code drops |
| #35 | WhatsApp + Check-in | 5 | First module gates; `whatsapp/send` audit catch (inline check kept) |
| #36 | Email campaigns cross-event isolation + emails routes | 6 | 🔴 Second security finding — data-layer; spawned `[[auth-migration-audit-pattern]]` memory |
| #37 | Domain + email-settings | 9 | Biggest cleanup, last legacy `auth()` in the surface |

**Cumulative findings:**

- **34 handlers** migrated to `authorizeEvent` (2+4+8+5+6+9).
- **2 cross-event isolation bugs closed:**
  - PR #32 — auth-helper layer: `form-fields/[fieldId]` GET + DELETE used global `authorize()` without per-event membership check.
  - PR #36 — data layer: `emails/campaigns/[campaignId]` GET + DELETE had correct `authorizeEvent` gates but unscoped data ops — a MANAGER on Event A could delete any campaign by CUID.
- **4 module gates introduced or normalized:** `whatsApp` + `checkIn` (PR #35), `customEmail` + `customDomain` (PR #37).
- **~80 lines net reduction across the sweep.** Categories: dead `event.findUnique` lookups (PR #34, PR #37), redundant inline checks superseded by module gates (PR #37), multi-step auth collapsed to single `authorizeEvent` calls (every PR).
- **`authorizeEvent` is now canonical** across `/api/events/[eventId]/*`. Verified by three independent greps on the final merge commit: zero `await auth()`, zero `auth()` calls of any shape, zero `from "@/lib/auth"` imports in the surface. *(2026-06-08: those greps were `auth()`-only — global `authorize()` remained on 8 handlers until PR #46/#47. "Canonical" is true as of those, not as of 2026-06-01.)*
- **One latent UX gap surfaced** during PR #35 smoke (module-gated pages remain visible in sidebar when module off; sub-endpoints correctly 403 but the console fills with errors). Pre-existing — the sweep made it visible, didn't cause it. Documented under "Known unresolved bugs" and added to the queue.

**Durable artifacts from the sweep:**
- `[[auth-migration-audit-pattern]]` memory — codifies the audit step that caught the two cross-event bugs (verify BOTH the `authorizeEvent` gate AND row-level scoping on data ops). Two confirmed applications with the inline-check verification refinement (PR #35 WhatsApp = semantically distinct, kept; PR #37 customDomain = equivalent, dropped) — opposite outcomes from the same discipline.
- `[[auth-posture-sweep-complete]]` memory — captures the operational state (canonical pattern, no legacy auth) plus the reusable module-gate pre-flight shape ("0 affected events → ship preventatively").

The audit discipline this sweep developed is worth reapplying to any future migration touching `/api/events/[eventId]/*` handlers.

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

_Queue is empty — no queued substantive feature. The broader per-event template/layout system remains deferred as a separate future project with its own spec._

### DONE

- ✅ **Stage 3 UI retry — Replace/Remove buttons + provenance** (was queue #1) — shipped 2026-06-07, PR #44 (`76527aa`). The reusable PR #39 stable-DOM template applied cleanly; UI rebuild was mechanical as predicted. `[[file-stage3-ui-complete]]`.
- ✅ **Admin-upload-from-empty** (was queue #2) — shipped 2026-06-07, PR #45 (`9275958`). New upload-into-empty endpoint + empty-field guard + `admin-new:` provenance sentinel + the Upload/Replace read-back poll race fix. `[[admin-upload-empty-complete]]`.

### Open follow-up tickets (small, not blocking)

- **Friendlier admin file-op error surfacing.** `@vercel/blob` `upload()` swallows the body of an `onBeforeGenerateToken` 400, so real Replace/Upload failures surface a generic SDK message ("Vercel Blob: Failed to retrieve the client token") instead of our specific reason (e.g. the empty-field guard's "use Replace instead"). User-reachable on genuine failures; pre-existing (also affects Replace). Would need a pre-flight check before `upload()`, or surfacing the reason another way. Low priority.
- **`CRON_SECRET` in Production** — confirm it's set so the nightly orphan-receipt cleanup cron (`/api/cron/cleanup-orphan-receipts`, 03:30 UTC) actually runs (surfaced during the 2026-06-11 Blob quota incident).

### Deferred from the 2026-06-12 review (user decision: "skip for now" — fix on trigger, not proactively)

All verified real but none lose data or breach security. The do-when triggers were agreed explicitly:

| Item | Trigger to pick it up |
|---|---|
| Role-blind action buttons (badges / whatsapp / checkin / form-builder pages render edit controls to VIEWERs; API rejects correctly) | The team starts adding **Viewer-role** members. Copy the `userCanEdit` pattern from attendees/page.tsx. |
| Phase-reminder partial-failure: `reminderSent` latch means a crash mid-batch silently skips the remainder, no retry | Reliance on **automatic phase reminders at scale** (hundreds of attendees). |
| Raw `confirm()` dialogs in 6 files (unstyled, English-only) | Cosmetic only. ⚠️ If picked up: replacing with shadcn AlertDialog must use the CSS-hide stable-DOM template (`[[radix-dialog-post-refetch-race]]`) — this app has shipped 3 reverts from naive dialog work. |
| smtpPort accepted unvalidated in email-settings; bare "Loading..." states; inconsistent date formats | Pure polish, batch into any future dashboard pass. |

---

## Known unresolved bugs

### Radix Dialog post-refetch race — RESOLVED on approvals/page.tsx (2026-06-02)

**Status:** The original 2026-05-23 diagnosis was wrong (vendor-chunk obscured production stacks made React's reconciler look like a Radix internal). Real cause + three-phase fix shipped in PR #39 (`80c3523`). Full diagnosis + reusable fix template in `[[radix-dialog-post-refetch-race]]` memory.

**Resolved 2026-06-07:** the FILE Stage 3 UI retry (PR #44) applied the template and shipped clean — Replace/Remove/provenance, zero DOMExceptions across all action paths. Nothing outstanding from this race.

---

## Productive Families launch status — LIVE (launched 2026-06-03)

- ✅ Logo configured — `logoUrl` plus `logoWhiteUrl` = `i.imgur.com/POuPyxt.png`; the white LA GLOIRE logo renders on the dark header strip (no event-name-text fallback).
- ✅ Date/time/venue hidden via data attributes + customCss — confirmed still hidden after the redesign shell restructure (the new event-meta row preserved the `[data-event-date]`/`[data-event-time]`/`[data-event-venue]` selectors verbatim).
- ✅ Product category options configured (20 categories, EN+AR translations)
- ✅ FILE field works end-to-end for visitor uploads
- ✅ Email optional (so synthetic-email visitors can register without an email)
- ✅ New centered-card registration page in production (Stages 1+2 of the redesign)
- ✅ **Name display resolved** — field-mapping is complete (PRs #24–#28) and PF's fields are tagged (First Name → FIRST_NAME; Middel Name + Third Name → LAST_NAME). Dashboard verified: **4/4** existing rows show real names, zero `Reg #...` fallbacks. No longer blocked.
- ✅ **`secondaryColor = #CB1681` set** in the Colors tab — submit-button green→magenta gradient now active.
- ✅ **Admin can fix wrong/missing visitor uploads from the dashboard** — resolved 2026-06-07. View/Replace/Remove (PR #44) + upload-into-empty (PR #45) all live on the attendee detail page; no Prisma Studio workaround needed.

Launched 2026-06-03 on the redesigned page with field-mapping live. As of 2026-06-07 there are no remaining functional gaps — admin file Replace/Remove/Upload-into-empty all work from the dashboard.

---

## Recent decisions and lessons (newest)

- **Capacity decisions MUST run under `approvalService.lockEventRow(tx, eventId)` inside the writing transaction.** The check-then-write pattern (read count → decide CONFIRMED/WAITLISTED → insert) oversells under concurrency without the Postgres row lock. Register, approve, and waitlist-promote all follow this now; any NEW write path that consumes capacity (imports? API registrations?) must take the lock or it reintroduces the race PR #52 closed.
- **Attendee filters live in ONE shared where-builder** (`src/lib/attendees/attendee-filters.ts`), consumed by both the list route and `registrations/export`. That sharing IS the "export matches the screen" guarantee. Adding a filter inline in either route silently breaks it — add to the module.
- **View state belongs in the URL, synced via `history.replaceState`** (not router navigation — no history spam, no re-render churn): initializers read `useSearchParams`, one effect writes the query string back. Two traps hit and solved on the attendees page: the page-reset-on-filter-change effect needs a **mount guard** or it clobbers the URL-restored page number; a detail page reading sessionStorage for its Back href must do it in state+effect, not at render time (SSR/hydration mismatch).
- **Subagent review findings need hand-verification before fixing.** The 2026-06-12 five-agent review produced two confident HIGH findings that were false (a "cross-event PATCH" with the guard plainly present at the top of the handler; an "OTP timing attack" against HMAC outputs). Every finding got verified against the actual code before any fix; the false ones are documented in `[[full-codebase-review-2026-06]]` so they don't get "re-fixed" later.
- **Rate-limit design under an anti-enumeration response:** the OTP request endpoint always returns success (no "is this email registered" signal) — so its throttle must be recorded for EVERY well-formed request, not just successful sends. Throttling only real sends would make the 429 itself the enumeration oracle.
- **"Migration complete" must be verified against ALL legacy patterns, not just the one the effort is named after.** The 2026-06-01 auth sweep was called "ARC COMPLETE — zero legacy `auth()`," and that grep was correct — but there were TWO global-auth helpers (`auth()` from `@/lib/auth` AND `authorize()` from `@/lib/api-auth`), and the sweep only enumerated the first. 8 `[eventId]` handlers sat on `authorize()` for a week, one with a live cross-event read/edit/delete bug. When you declare a migration done, grep for every shape of the old pattern (here: BOTH `auth(` and `[^E]authorize(`), and spot-check that the "canonical" replacement is actually the only thing left.
- **Cross-event isolation is a DUAL gate — the auth helper AND the data op.** `emails/templates/[templateId]` had `authorizeEvent`-shaped intent but `findUnique({where:{id}})` — a row op keyed on id with no `eventId` lets a member of event A reach event B's row. Same class as PR #32 (form-fields) and #36 (campaigns). Fix BOTH: `authorizeEvent(eventId,{role})` + scope every data op to `{id, eventId}` (`findFirst`/`updateMany`/`deleteMany` + null/count → 404). Smoke must prove both independently: cross-event URL → 403 (gate), own-event URL + other-event row id → 404 with a DB check that nothing leaked/mutated (scoping). Codified in `[[auth-migration-audit-pattern]]`.
- **Client-upload flows have a webhook-timing race — and localhost mocks HIDE it. Verify against the real webhook on Preview, never a localhost mock.** `@vercel/blob` `upload()` resolves when bytes hit storage, BEFORE the `onUploadCompleted` webhook persists the DB row. So a refetch fired immediately after `await upload()` reads stale/empty data. Admin Upload AND Replace both had this; **Replace's was SILENT** — a lost race showed the OLD file, which reads as success — and it was **live in prod from the Stage 3 UI merge until the 2026-06-07 fix**. The bug survived earlier testing because the webhook *cannot reach localhost*, so a mocked refetch never exercised the real ordering. **Fix:** read-back poll mirroring the visitor `waitForUploadedFile` (`file-upload-control.tsx`) — after `await upload()`, poll until the field reflects the new file (12×800ms ≈ 10s), then settle; on timeout show an honest "taking longer — refresh to check" state, never silently empty/stale. **Process rule: any file-upload flow (anything using `@vercel/blob` client `upload()` + an `onUploadCompleted` webhook) MUST be verified against the real webhook on a Preview deployment. A green localhost smoke proves nothing about webhook timing** — locally the webhook is effectively mocked away. For local smoking, substitute the webhook with a poll-synchronized real DB write, but treat Preview as the gate. `[[admin-upload-empty-complete]]`.

- **`@vercel/blob` `upload()` swallows `onBeforeGenerateToken` 400 bodies.** A reason thrown inside `onBeforeGenerateToken` (e.g. the empty-field guard, an auth failure) comes back to the client as a generic "Vercel Blob: Failed to retrieve the client token" — our specific message is lost. Server-side rejection is still correct (400, no row). Filed as the "friendlier admin file-op error surfacing" follow-up ticket. Affects every `handleUpload`-based admin route (Replace too), so most error paths are unreachable via normal UI but the message fidelity is poor when they are hit.

- **Per-field settings are DATA and are per-environment — schema crosses environments, config doesn't.** `prisma db push` carries *structure* (a new column/enum) to whichever DB it targets, and we push to both staging and prod. But a per-field *value* (e.g. `business_activity.optionColumns = TWO`) is row data written by whichever DB the app was hitting. **Preview deployments write to the staging Neon branch**, so config you set while testing on a Preview URL lands in *staging*, not production. After Feature B merged, the feature was live on prod but `business_activity` was still `AUTO` there — the launch layout had to be re-set on the **production** form-builder. Rule: treat "set it up on Preview" as a rehearsal; any per-field/per-event config that matters for launch must be redone on production (or migrated deliberately). Verify via the public API (`optionColumns=…`), not by memory of what Preview looked like.

- **Vercel Blob token identity = the embedded store id, NOT the env-var name.** Both Blob stores expose their read-write token in the dashboard under the *same* name `BLOB_READ_WRITE_TOKEN`; the custom name `BLOB_PUBLIC_READ_WRITE_TOKEN` exists only in our code/env. The store id is embedded in the token value — `vercel_blob_rw_<storeId>_…` — so verify which token you have by that, not the variable name. Public store = `O0LBuk4rM0qMcAYL`, private = `Q7RjwvBaaLwKE6eR`. This bit us: the private token was pasted into `BLOB_PUBLIC_READ_WRITE_TOKEN` on Vercel, and `put({access:"public"})` failed with *"Cannot use public access on a private store"* (a *valid* token for the *wrong* store — not an auth error). Confirm before deploying with: `vercel_blob_rw_` + store id.
- **Blob `access` is a STORE-level setting, not per-blob.** A private store rejects `put({access:"public"})` outright — public and private blobs cannot coexist in one store. Public-serving branding assets needed a *separate* public store. The one-time `public-put-smoke-test.ts` gate caught this before any upload code was built.
- **Spec literal hex on event-themed controls = flag for deviation review.** The MULTISELECT Stage 2 spec wrote selected state as `#7EC43F` border + `#f4faec` tint + green dot. For any event with a non-green `primaryColor` that would regress per-event theming on a large, prominent control. Defaulted to `primaryColor + alpha-derived tint` (`\`${primaryColor}1a\``) instead — Productive Families still renders the mockup exactly, other events theme to their own brand. Codified in `[[spec-literal-vs-event-theming]]`; apply whenever a spec writes literal color hex on a surface that currently reads from `EventBranding`.
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
- `register-redesign-complete.md` — Stages 1+2 shipped 2026-06-02; centered-card shell + MULTISELECT card grid; 5 locked spec deviations including primaryColor-themed MULTISELECT over hardcoded green
- `spec-literal-vs-event-theming.md` — when a spec writes literal hex for visual states on controls themed off EventBranding, flag as deviation question; user prefers `primaryColor + alpha-derived tint` over hardcoded brand color
- `branch-cleanup-gh-api-delete.md` — PR-merge cleanup uses `gh api -X DELETE refs/heads/<branch>`, NOT `--delete-branch`; required by the worktree setup. Codifies the squash → API-delete → detach → local-delete → watch-prod-deploy sequence.
- `file-stage3-ui-complete.md` — FILE Stage 3 UI (Replace/Remove/provenance) shipped via the CSS-hide stable-DOM template; reusable Playwright network-interception smoke for the remote-DB/local-webhook env; stale-dev-server auth-500 footgun
- `admin-upload-empty-complete.md` — upload-into-empty endpoint + empty-field guard + `admin-new:` provenance sentinel + shared `writeFileRefDualStore`; the webhook-timing race + read-back poll fix; webhook-can't-fire-on-localhost verification reality (real timeout test vs poll-synchronized DB-write success test); tsx `@/`-alias service-test technique
- `upload-image-compression-shipped.md` — client-side compression params (1800px / q0.82 / >400KB), what's exempt (PDF, HEIC, small), why those numbers (ID legibility)
- `blob-stores-and-dev-db-footgun.md` — the two stores + tokens, the DEV-DB-local/PROD-blob-token reconciliation footgun, the "connection lost" catch-all masking quota errors
- `full-codebase-review-2026-06.md` — review-pass close-out: lockEventRow contract, rejected false-positive findings (don't re-fix), the deferred-items list with triggers
- `attendee-field-filters.md` — shared where-builder contract, fieldFilters param validation, Prisma groupBy quirks, URL-state + scroll-memory patterns, single-consumer API note

---

## Files in Project Knowledge

- `specs/PHASE_BASED_FORMS_SPEC.md` — completed feature
- `specs/PHASE_SELECTIONS_SPEC.md` — completed feature
- `specs/ATTENDEE_DETAIL_REDESIGN_SPEC.md` — completed feature
- `specs/CATEGORY_PHASES_SPEC.md` — completed feature
- `specs/TRANSLATION_AND_BULK_OPTIONS_SPEC.md` — completed feature
- `specs/OTHER_AND_MAX_SELECTIONS_SPEC.md` — completed feature
- `specs/FILE_FIELD_SPEC.md` — completed feature; admin file-ops fully realized 2026-06-07 (View/Replace/Remove/provenance PR #44 + upload-into-empty PR #45)
- `specs/EMAIL_OPTIONAL_EVENTS_SPEC.md` — completed feature
- `specs/ADMIN_EDIT_FIX_SPEC.md` — ARC FULLY COMPLETE on production. Stages 1, 2, 4 + Stage 3 backend AND Stage 3 UI (Replace/Remove/provenance, PR #44, `76527aa`) all live. Nothing deferred.
- `specs/FIELD_MAPPING_SPEC.md` — FEATURE COMPLETE (all 5 PRs shipped: #24, #25, #26, #27, #28)
- `specs/REGISTRATION_REDESIGN_SPEC.md` — FEATURE COMPLETE (Stages 1+2 shipped: PRs #40, #41)
- `specs/REGISTRATION_CUSTOMIZATION_SPEC.md` — **Feature A + B both COMPLETE — spec fully shipped.** A: header & logo controls + upload (PR #42, `5ab3977`). B: per-field option columns (PR #43, `46a99eb`). Template system deferred separately.
- `CLAUDE.md` — project conventions
- `prisma/schema.prisma` — current schema
- `PROJECT_HANDOFF.md` — this document

---

## How to start the new conversation

1. Open the Registration System Project on Claude.ai
2. Click "New chat"
3. State what you want to work on. The queue is empty — recent arcs (registration customization, FILE admin file-ops, the attendees-page rebuild) are all shipped. Possible next directions:
   - **Deferred review items** → see the trigger table under "Deferred from the 2026-06-12 review" — pick one up only when its trigger fires (Viewer-role members added; reminder volume grows).
   - **Friendlier admin file-op error surfacing** → small follow-up ticket (see "Open follow-up tickets"); make the empty-field-guard / auth reasons reach the admin instead of the generic SDK token message.
   - **The per-event template / layout system** → the larger deferred project; needs its own spec.
   - Or bring a new feature request — Claude will spec → audit → mockup → chunk → PR as usual.

Whatever you pick, Claude will read this handoff + the specs + memory and pick up from here without re-asking.

---

*Updated 2026-06-13. **Attendees-page arc complete** — PR #53 (`198f77c`): dynamic form-answer filters derived from each event's own form (city/gender/nationality on PF; whatever fields elsewhere), executed server-side on `Registration.formData` JSON paths via the shared where-builder that also drives `registrations/export` ("export = screen" by construction), PLUS server-side pagination/aggregates for 7k+ events and a one-transaction `contacts/bulk-delete` (was 7k sequential DELETEs). PR #54 (`83cc2c6`): view state persisted in the URL (back/refresh/share restores filters+page), scroll + return-URL memory across the detail round trip, numbered pager with ellipsis. Earlier the same window, PR #52 (`2d93b0d`) shipped the full-codebase review hardening — headline: the capacity-oversell race closed with `approvalService.lockEventRow` (`SELECT … FOR UPDATE`; any future capacity-writing path must take it), plus OTP request throttling (enumeration-safe), required-CHECKBOX/MULTISELECT validation, register-body key filtering, users-route zod validation, and dashboard silent-failure fixes. Two review findings rejected as false positives (documented — don't re-fix). Deferred items + triggers live in the queue section. From the separate 2026-06-11 session: Blob quota incident → image compression (PR #50) + guarded orphan-blob script (PR #51); COUNTRY export fix (PR #49).*

*Updated 2026-06-08 (later). **Excel attendee export shipped** — PR #48 (`6218bed`): "Export as Excel" alongside the unchanged CSV button; xlsx renders each FILE field as a clickable cell → the admin-auth-gated `…/files/[fileId]/stream` (logged-in admins only, 401 otherwise — no public exposure); base columns now form-aware (Email/Phone/Org/Designation gated on `mapsTo`-or-legacy-name, First/Last + Category/Status/system always-on); CSV and xlsx column sets identical. Rides on existing infra (no new store/endpoint/schema). Known out-of-scope item logged in `[[csv-export-routes]]`: a role-mapped-but-differently-named field (e.g. `company`→ORGANIZATION) shows as both the base column AND its own dynamic column; future-ticket fix = exclude dynamic fields by `mapsTo`, not just `name`.*

*Updated 2026-06-08. **Auth posture sweep TRULY complete** — the 2026-06-01 "ARC COMPLETE" was `auth()`-scoped only; global `authorize()` (no per-event membership) sat on 8 `[eventId]` handlers, one with a 🔴 live cross-event template read/edit/delete. PR A #46 (`c45d3e8`, 6 mechanical files, roles preserved) + PR B #47 (`1c95157`, cross-event data isolation on `emails/templates/[templateId]` + `attendees/send-email`, scoped to `{id,eventId}`) closed it; both live on prod. Prod pre-flight = 0 affected. Email-send routes kept at `editor` (a manager bump is a separate decision). `authorizeEvent` is now genuinely canonical in `/api/events/[eventId]/*` (only the global `events/route.ts` collection still uses `authorize()`, correctly). **Process rules added: grep ALL legacy auth shapes when declaring a migration done; cross-event isolation needs BOTH the gate and `{id,eventId}` row scoping.** Open follow-up: friendlier admin file-op error surfacing (SDK swallows 400 bodies). Open hygiene (pending from 2026-06-03): rotate the DB passwords + `branding-public` blob token surfaced during setup.*
