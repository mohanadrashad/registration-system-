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

1. **Admin-Edit-Fix Stage 4 — audit trail display.** Smallest stage. Pure read-side UI consuming Stage 1's audit columns: "Last edited by [Name] · [time]" on attendee detail header + approver/rejecter/reason in approvals dashboard. No backend, no Radix dialogs, no race surface. Expected ~1-2 hours.

2. **Field-mapping (new feature — Approach 2 from late-night conversation).** Solves Productive Families' name display problem. Admin tags form fields with "Maps to: First Name / Last Name / Email / Phone / Organization / Designation / Category" in the form-builder. Registration endpoint reads tags and populates Contact columns. Will need its own spec conversation before implementation. Probably 2-3 stages.

3. **Stage 3 UI retry — Replace/Remove buttons + provenance.** Deferred from Stage 3 backend merge. See "Known unresolved bugs" for diagnosis-to-build-on.

4. **Admin-upload-from-empty (new feature requested late session).** Admin can upload a NEW file (not just replace) when FILE field has no value. Mostly a duplicate of Replace logic. Half-day of work once Stage 3 UI retry is resolved. Critical for Productive Families if visitor's commercial registration is missing.

5. **PhaseReceipt buildReceiptPathname cleanup.** Small dead-code follow-up from FILE Stage 3 audit.

6. **Contact GET handler per-event auth.** Surfaced during Stage 2 audit. Read-only handler still uses legacy `auth()`. Lower-stakes since cross-event filter at line 30 prevents data leak; only consequence is unauthenticated-to-event users could poll for known contactIds. Mechanical migration matching Stage 2's pattern.

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
- `specs/ADMIN_EDIT_FIX_SPEC.md` — Stages 1-3 complete (Stage 3 backend-only); Stage 4 next
- `CLAUDE.md` — project conventions
- `prisma/schema.prisma` — current schema
- `PROJECT_HANDOFF.md` — this document

---

## How to start the new conversation

1. Open the Registration System Project on Claude.ai
2. Click "New chat"
3. State what you want to work on:
   - "Let's start Stage 4 (audit trail display)" → smallest next stage, low complexity
   - "Let's spec the field-mapping feature" → blocker for Productive Families launch, needs design conversation first
   - "I want to retry Stage 3 UI" → has diagnosis ready, requires sourcemap setup first
   - "Let's spec admin-upload-from-empty" → smaller feature, requires Stage 3 UI to be working first

Claude will read this handoff + the specs + memory and pick up from here without re-asking.

---

*Updated end of marathon session 2026-05-23. Three of four admin-edit-fix stages done. Deferred work has clear diagnosis. Field-mapping is the next blocker for Productive Families launch.*
