# Translation Service + Bulk Option Paste — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation in 2 sequential stages.
**Prerequisites:** All previous features (Phase-Based Forms, Phase Selections, Attendee Detail Redesign, Category-Based Phase Logic) are deployed and stable in production.

---

## Overview

Bilingual content across the admin is a click-by-click manual job today. Every `labelAr` / `descriptionAr` / `helpTextAr` input is empty until an admin types Arabic into it. For a multi-select field with 20 options (real example: the "Productive Families" event's product-category field), that's 20 manual translations × 2 fields each (`label` + `value`) = a tedious 5-minute click-fest per field.

This spec ships two reusable primitives that fix both halves of the friction:

1. **`<BilingualInput>`** — a wrapper around the existing EN/AR input pair that adds a small "Translate" button. Click it, the empty side gets filled via MyMemory's translation API, admin edits if needed.

2. **`<BulkPaste>`** — a dialog launched from a "Bulk add" button next to "+ Add option." Accepts a list of strings (single-language or tab/pipe-separated bilingual), parses with preview, and creates options in bulk. Optionally runs every entry through the translation service.

The two primitives are independent in code but compose well: the bulk-paste dialog's "Translate all" button uses the translation service. Both can ship as separate PRs.

---

## Goals

- An admin can fill an Arabic field by typing the English version and clicking "Translate" (and vice versa).
- An admin can paste a list of 20 product categories in one go instead of clicking "+ Add option" 20 times.
- An admin can paste single-language list and translate the whole list in one click before committing.
- Auto-translations are always editable — they're a starting point, not a commitment.
- Low-confidence translations surface as "needs review" hints, not silent acceptance.
- All `FormField.options`, `PhaseOption` arrays, `FormField` labels/placeholder/helpText, and (later) `Phase`/`Step` titles benefit from the same two primitives — no per-call-site UI duplication.

## Non-Goals

- Translation between any languages other than English ↔ Arabic.
- Real-time translation as the admin types. Translation is on explicit click only.
- Server-side caching of translation results. Cost and rate-limits don't justify the complexity.
- Translation for languages the platform doesn't otherwise support (e.g. French).
- Auto-translate on form-builder save. Always a deliberate admin click.
- Custom translation models or domain-specific glossaries. Use MyMemory's defaults.
- Fixing the existing `PhaseOptionsPanel` bilingual gate inconsistency (the `labelAr`/`descriptionAr` rendering unconditionally without checking `multiLanguage`). Out of scope — flagged in handoff for a separate 2-line follow-up PR.

---

## Architecture

### Translation service (server-side)

```
src/lib/services/translation.service.ts
  └─ translate({ strings: string[], from: "en"|"ar", to: "en"|"ar" }):
       Promise<TranslateResult[]>

  └─ Calls MyMemory's GET endpoint per string (no batch endpoint exists)
  └─ Sends de=<MYMEMORY_EMAIL> param for the 50k chars/day quota
  └─ Runs requests in parallel via Promise.allSettled
  └─ Returns per-string result: { translatedText, matchScore, status, error? }
```

```ts
type TranslateResult =
  | { status: "ok"; translatedText: string; matchScore: number }
  | { status: "low_confidence"; translatedText: string; matchScore: number }
  | { status: "error"; error: string };
```

### API endpoint

```
POST /api/translate
  Body:    { strings: string[], from: "en"|"ar", to: "en"|"ar" }
  Auth:    Admin session required (any authenticated dashboard user)
  Returns: { results: TranslateResult[] }
```

- Rate-limited: 60 requests/min per user (in-memory bucket — same shape as the existing OTP rate limiter in `src/lib/portal/login-rate-limit.ts`, just admin-scoped).
- Zod-validated: `strings` array length ≤ 100, each string ≤ 500 chars.
- No event scoping — translation is a global admin utility, doesn't touch event data.

### UI primitives

```
src/components/admin/bilingual-input.tsx
  Props:
    - valueEn: string
    - valueAr: string
    - onChangeEn: (v: string) => void
    - onChangeAr: (v: string) => void
    - label?: string  (e.g. "Field label")
    - placeholder?: { en?: string; ar?: string }
    - multiline?: boolean  (renders <textarea> instead of <input>)
    - disabled?: boolean

  Renders:
    [Label]
    [EN input              ] [↔ Translate]
    [AR input              ]

  Behavior:
    - Translate button is enabled only when exactly one side has content.
    - Click: calls /api/translate with the populated side, fills the empty side.
    - Low-confidence results: field is filled, but a small ⚠️ "Low confidence — please review" hint shows below for 5 seconds (or until the field is edited).
    - Errors: a small "Translation failed — please fill manually" hint shows for 5 seconds.
    - During the call: spinner on the button, both fields stay editable.
    - The button never overwrites a non-empty field without confirmation dialog ("Replace existing translation?").
```

```
src/components/admin/bulk-paste-dialog.tsx
  Props:
    - open: boolean
    - onClose: () => void
    - onCommit: (items: Array<{ labelEn: string; labelAr: string }>) => void
    - title?: string  (defaults to "Bulk add options")

  Renders (modal):
    [Format selector] (auto-detected, admin can override)
      ◯ Single language (one per line) — language: [EN ▾]
      ◯ Bilingual (EN | AR or EN<tab>AR per line)

    [Large textarea for paste input]

    [Translate all] (visible only in single-language mode)

    [Preview table]
      | English          | Arabic           | Status     |
      | --------------- | ---------------- | ---------- |
      | Cosmetics       | مستحضرات تجميل   | ✓ Ready    |
      | Plants          | (empty)          | ⚠ Needs AR |
      | Books           | الكتب            | ⚠ Low conf |

    [Cancel] [Add 18 items]   ← count reflects only "Ready"+"Needs AR" rows;
                                low-confidence rows still count as addable
                                (admin already saw the warning in the preview).
```

---

## Behavior Specifications

### Translation service — MyMemory integration

**Endpoint:** `GET https://api.mymemory.translated.net/get?q=<text>&langpair=<from>|<to>&de=<email>`

**Email param:** Read from `MYMEMORY_EMAIL` env var. Falls back to anonymous (5k/day) if not set. Production value: `mohanad77rashad@gmail.com`.

**Per-string call pattern:**

```ts
async function translateOne(text: string, from: Lang, to: Lang): Promise<TranslateResult> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `${from}|${to}`);
  if (process.env.MYMEMORY_EMAIL) url.searchParams.set("de", process.env.MYMEMORY_EMAIL);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { status: "error", error: `HTTP ${res.status}` };

    const json = await res.json();
    const translated = json.responseData?.translatedText;
    const matchRaw = json.responseData?.match ?? 0;

    // MyMemory's `match` is sometimes returned as 0.85, sometimes as 85.
    // Normalize to 0-1 range.
    const matchScore = matchRaw > 1 ? matchRaw / 100 : matchRaw;

    if (!translated || typeof translated !== "string") {
      return { status: "error", error: "No translation returned" };
    }

    if (matchScore < 0.4) {
      return { status: "low_confidence", translatedText: translated, matchScore };
    }

    return { status: "ok", translatedText: translated, matchScore };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Unknown error" };
  }
}
```

**Batch behavior:** `translate({ strings, ... })` runs all strings through `Promise.allSettled(strings.map(translateOne))`. Failures are captured per-string; one failure does not break the rest.

**Confidence threshold:** 0.4. Below this, the translation is still returned (admin may still want to use it as a starting point) but flagged `low_confidence` in the response. UI surfaces this as a hint, not a rejection.

**Quota awareness:** MyMemory returns a `responseStatus: 429` or a specific quota-exceeded message in the body when the daily limit is hit. The service detects this and returns `status: "error", error: "Daily translation quota reached"`. UI shows: "Translation quota reached for today. Please fill manually or try again tomorrow."

**Edge cases:**
- Empty input string → `status: "error", error: "Empty input"`. Don't call the API.
- Input >500 chars → reject at the API layer (Zod) before the service runs.
- HTTP errors, timeouts → captured per-string, don't break batch.
- MyMemory occasionally returns the **input unchanged** as the translation (no match found). When `translatedText === text`, treat as `status: "low_confidence", matchScore: 0`.

### `<BilingualInput>` behavior

**Enabled state:** Translate button is enabled only when exactly one of the two fields has content. Both empty → button disabled. Both filled → button disabled (admin would have to clear one first, or confirm overwrite).

**Direction inference:** The non-empty side is the source. EN→AR or AR→EN follows automatically.

**Overwrite confirmation:** If the admin types into both fields then clicks Translate, the button is disabled — there's no ambiguity to resolve. A separate "Re-translate" affordance is not in v1.

**Low-confidence rendering:** After a translation completes with `low_confidence`, the field is filled, and a small ⚠️ hint appears below the AR (or EN) input: *"Auto-translated, low confidence — please review."* The hint dismisses on next field edit or after 5 seconds.

**Error rendering:** Same shape, different copy: *"Translation failed: <message>. Please fill manually."*

**Loading state:** Button shows spinner during the call. Both fields stay editable — admin can keep typing if they don't want to wait.

**Bilingual gating:** `<BilingualInput>` does NOT gate visibility of the AR field on the `multiLanguage` module flag. That's the caller's responsibility — caller renders `<BilingualInput>` or the plain `<Input>` based on context. Keeps the component reusable.

### `<BulkPaste>` behavior

**Auto-detection on paste:**
- Each line is examined.
- If **any** line contains a `|` or tab character → bilingual mode (with that separator).
- Otherwise → single-language mode (admin picks EN or AR from a dropdown).
- Admin can override the detection with the radio selector.

**Parsing:**
- Lines are split by `\n`.
- Empty lines are skipped.
- Leading/trailing whitespace is trimmed per cell.
- In bilingual mode, lines that don't have exactly one separator → parse error row in preview (highlighted red, can't commit).
- In single-language mode, every non-empty line is one item.

**Preview table:**
- One row per parsed entry.
- Status column shows: ✓ Ready (both EN+AR present), ⚠ Needs AR / Needs EN (one side missing), ⚠ Low confidence (translated, score <0.4), ✗ Parse error.
- Admin can edit cells inline in the preview before commit. Editing recomputes status.
- The "Add N items" button counts: Ready + Needs-other-side + Low confidence. Parse-error rows are excluded.

**Translate all:**
- Visible only in single-language mode.
- Click → calls `/api/translate` once with all parsed strings.
- During the call, preview shows spinner per row.
- Results populate the empty AR (or EN) cells in the preview.
- Low-confidence and error rows update their status accordingly.
- Admin reviews preview, edits if needed, clicks "Add items."

**Commit:**
- Calls `onCommit` callback with the array of items.
- Caller is responsible for creating the rows (FormField options array update, PhaseOption insert, etc.) and computing the `value` field for each.

**Value generation (caller responsibility):**
- For `FormField.options`: the `value` is generated from `labelEn` via slugification: lowercase, replace spaces with underscores, strip non-alphanumeric. e.g. "Cosmetics and care" → `cosmetics_and_care`. Collisions get `_2`, `_3` suffix.
- For `PhaseOption`: no auto-`value` — `PhaseOption.id` is the system identifier, `label` is display only.
- **Value lock for FormField options:** once a `FormField` has any attendee submissions referencing an option's `value`, that `value` becomes immutable. The label/labelAr stay editable; the value doesn't. Check before update; surface as a UI-level guard in the option editor (caller's responsibility, not the bulk-paste dialog's).

### Retrofit scope per stage

**Stage 1 (BilingualInput retrofit targets):**
- `FormField` editor: `label`/`labelAr`, `placeholder`/`placeholderAr`, `helpText`/`helpTextAr`.
- `FormField` options editor: per-option `label`/`labelAr` rows.
- `PhaseOption` editor: `label`/`labelAr`, `description`/`descriptionAr`, `receiptLabel`/`receiptLabelAr`, `receiptInstructions`/`receiptInstructionsAr`.

**Stage 2 (BulkPaste retrofit targets):**
- `FormField` options array (for SELECT/MULTISELECT/RADIO/CHECKBOX field types).
- `PhaseOption` list (for post-reg phases with `selectionMode != NONE`).

**Out of scope for both stages:**
- `Phase`/`Step` titles + descriptions — they're rarely lists, low priority for translation. Retrofit later if useful.
- `EventBranding` welcome text — different surface, different priority.

---

## Schema

**No schema changes.** This feature is pure UI + a new API route. Existing `*Ar` columns are the storage; only the input experience changes.

---

## Implementation Stages

### Stage 1 — Translation service + `<BilingualInput>`

- Add `MYMEMORY_EMAIL` env var to all three Vercel environments. Value: `mohanad77rashad@gmail.com`.
- `src/lib/services/translation.service.ts` — service with `translate()` function.
- `POST /api/translate` route with Zod validation, admin auth, rate limit (60/min/user).
- `src/components/admin/bilingual-input.tsx` — reusable component.
- Retrofit in this order:
  1. `PhaseOption` editor — highest impact (selections feature is recent, admins are actively using it).
  2. `FormField` options editor — the productive-families case directly.
  3. `FormField` label/placeholder/helpText — broadest reach across the builder.
- Existing AR inputs at retrofit sites keep working — just gain the Translate button.
- **Verify:** open form-builder, type an English label, click Translate, see Arabic populate. Try low-confidence input, see hint. Try with API down (block via DevTools network tab), see error hint.
- **Deliverable:** translate-on-click works everywhere bilingual content is edited in the form-builder. No bulk yet.

### Stage 2 — `<BulkPaste>` for option arrays

- `src/components/admin/bulk-paste-dialog.tsx` — modal component.
- Wire "Bulk add" button into `FormField` options editor (SELECT/MULTISELECT/RADIO/CHECKBOX field types).
- Wire "Bulk add" button into `PhaseOption` list (when `selectionMode != NONE`).
- Value-generation helper for FormField options (snake_case slugify + collision suffix).
- Value-lock guard at the API layer for FormField option updates (reject changes to `value` when any registration's `formData` references it).
- **Verify on staging:** open a MULTISELECT field, click "Bulk add," paste the 20-item productive-families list, hit Translate all, review preview, commit. All 20 options created with English + Arabic + slugified value.
- **Deliverable:** end-to-end bulk-add with optional auto-translation. Productive-families case takes 30 seconds instead of 10 minutes.

---

## Quality Disciplines

### Mockup before code

Form-builder is ~1734 LOC. Both stages touch its rendering. Per `CLAUDE.md`, **visual mockups must be approved before code is written** for:

- Stage 1: BilingualInput placement in the FormField editor (especially in the options editor where there are already 2 inputs per row plus reorder controls — fitting a Translate button needs careful layout).
- Stage 2: BulkPaste dialog layout, format selector, preview table.

Mockups can be ASCII diagrams or simple wireframes. Approved before Claude Code touches the builder.

### Pre-flight audit

Before each stage, Claude Code runs the audit pattern (see handoff): "show me the current code path for [target]" and reports back before implementing. Specifically:

- **Stage 1:** Audit the existing AR input rendering in FormField editor, FormField options editor, PhaseOption editor. Confirm where the inputs live, how their state flows, and whether there are any custom layout constraints to preserve.
- **Stage 2:** Audit how options are currently added to FormField (the JSON array on `FormField.options`) and to PhaseOption (the separate table). The state-update shapes will differ; both need to work.

### Staging-first

- Stage 1 env var added to Preview first. Smoke-test on Preview's form-builder against staging DB.
- Stage 2 verified on staging with the productive-families test case end-to-end.
- No production deploy until staging is clean.

### No new infrastructure

- Translation service is a fetch wrapper, no SDK.
- Rate limiter is in-memory, matches the existing pattern.
- No new env vars beyond `MYMEMORY_EMAIL`.

### Bilingual

- The `<BilingualInput>` and `<BulkPaste>` UIs themselves are admin-facing and stay English-only per the long-standing scope rule.
- The values they produce land in existing `*Ar` columns and render correctly on the portal via existing `pickText`/RTL logic.

---

## Acceptance Criteria

### Stage 1

- [ ] Mockup of BilingualInput placement in form-builder approved before code starts.
- [ ] `MYMEMORY_EMAIL` env var present on Dev, Preview, Production.
- [ ] `POST /api/translate` returns correct shape for happy path, low-confidence, and error cases.
- [ ] Rate limiter rejects 61st request in a minute with 429.
- [ ] Zod validation rejects empty arrays, oversized arrays (>100), oversized strings (>500).
- [ ] BilingualInput Translate button disabled when both sides empty or both sides filled.
- [ ] Translate fills empty side with returned text.
- [ ] Low-confidence translations show ⚠️ hint below the filled field.
- [ ] Errors show a clear inline hint.
- [ ] FormField label/placeholder/helpText editors use BilingualInput.
- [ ] FormField options editor uses BilingualInput per option row.
- [ ] PhaseOption editor uses BilingualInput for label/description/receiptLabel/receiptInstructions.
- [ ] Existing data renders correctly through the new component (no AR data lost or corrupted).

### Stage 2

- [ ] Mockup of BulkPaste dialog approved before code starts.
- [ ] Auto-detect picks bilingual mode when any line contains `|` or tab.
- [ ] Single-language mode shows the Translate all button; bilingual mode hides it.
- [ ] Translate all populates empty cells with translations and updates status per row.
- [ ] Parse-error rows highlighted in preview and excluded from commit.
- [ ] Inline editing in the preview table recomputes status.
- [ ] "Add N items" button reflects accurate count (excludes parse errors).
- [ ] FormField options bulk-add auto-generates `value` from English label (snake_case slug).
- [ ] Slug collisions resolved with `_2`, `_3` suffix.
- [ ] Value-lock guard rejects API updates to FormField option `value` once submissions reference it.
- [ ] PhaseOption bulk-add creates the right number of rows with correct `order` values.
- [ ] Productive-families test case: 20 Arabic categories, translate-all, commit, all 20 created with correct EN/AR/value.

### Whole-feature

- [ ] Both stages deployed and verified on staging.
- [ ] No regression on existing AR field rendering or saving.
- [ ] Translation works against MyMemory's production API at expected quality (35% edit rate or better on typical event content).
- [ ] Admin can configure a new event with bilingual fields and option lists in <10 minutes (vs ~45 minutes today).
- [ ] No new infrastructure dependencies beyond the MyMemory free-tier HTTP API.

---

## Open Questions

1. **Cache identical inputs in a single page-load session?** If admin clicks Translate on the same string twice, second call could be served from a Map in component memory. Saves quota and latency. Default: **no, v1.** Quota is huge; extra complexity not worth it.

2. **Show match score in the preview table?** As a number, or just the qualitative ⚠️ flag. Default: **qualitative only.** The score is meaningless to most admins; the warning is what matters.

3. **Re-translate confirmation copy.** When Translate is clicked on a field that already has content (which is currently disabled — both-filled = button disabled), should we add an "Overwrite" affordance with confirmation? Default: **no in v1.** Admin can clear the field manually if they want to retranslate.

4. **Bulk-add UX for non-list contexts.** Stage 2 only retrofits the two list-shaped surfaces (FormField options + PhaseOption). Should Phase reminder templates or other multi-item admin surfaces get bulk-add too? Default: **no, scope discipline.** Add later if asked.

5. **What happens if the option editor has unsaved changes when admin opens Bulk add?** Modal could either: (a) commit pending edits first, (b) reject opening with "save your changes first," (c) discard pending and proceed. Default: **(b) reject with warning.** Loss-prevention beats convenience.

---

## Notes for Claude Code

- This spec is net-new. It does not replace any earlier spec.
- Two PRs. Stage 1 alone is shippable and useful even if Stage 2 never lands.
- Honor existing patterns: services in `src/lib/services/`, Zod schemas in `src/lib/validations/`, admin-only API auth via existing `auth()` from `src/lib/auth.ts` (NOT `authorizeEvent` — this route isn't event-scoped).
- The translation service is fetch-based, no SDK dependency. No `npm install` needed.
- Rate limiter pattern: copy the structure of `src/lib/portal/login-rate-limit.ts`, swap the key from registration-id to session-user-id.
- Both UI primitives go in `src/components/admin/` (new directory if needed). They're admin-only, not portal.
- Do not gate `<BilingualInput>`'s AR field on the `multiLanguage` module flag inside the component. Let callers decide.
- Do not fix the existing PhaseOptionsPanel `multiLanguage` gate inconsistency in this PR. Out of scope; flagged in handoff for separate follow-up.
- Do not add tests unless explicitly asked.
- One commit per logical chunk per stage. Push each stage as its own PR.
- Pre-flight audit before each stage; surface any deltas from the spec in the PR description.

---

*Approved for implementation, stage by stage, with staging verification between stages.*
