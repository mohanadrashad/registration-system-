# Registration Customization — Header & Layout Controls

**Status:** Spec — not started
**Owner:** Mohanad
**Depends on:** Registration redesign (Stages 1+2, shipped — this is "Template #1")
**Touches:** `EventBranding`, `FormField`, public registration renderer, branding admin tab, form-builder
**Related specs:** `REGISTRATION_REDESIGN_SPEC.md` (the design these controls customize)

---

## 1. Why

The redesigned registration page is currently one fixed look with a hidden fallback chain. Admins can theme colors/logo/text but cannot:

- choose the **header strip color** (hardcoded `#0c0c0e`),
- choose **whether the header shows the logo or the event name** (today it's an implicit `logoWhiteUrl → logoUrl → event-name text` fallback, not a switch),
- control the **logo size** in the header,
- **upload** a logo instead of pasting a URL (the URL-only flow has bitten us — only `i.imgur.com/X.png` direct links work; Google Drive and gallery links fail).

Separately, the MULTISELECT option grid renders **1 column on mobile / 2 on desktop** for every field. A 20-option list (e.g. Productive Families' "النشاط التجاري") becomes a long mobile scroll, with no per-field control.

This spec adds explicit, per-event customization for both, with renderer-level guardrails so no setting can break the layout on phone or desktop.

## 2. Scope

- **Feature A — Header & logo controls** (header color + auto-contrast, logo/name hard switch, logo size, upload-instead-of-link).
- **Feature B — Per-field option columns** (AUTO / ONE / TWO, with no-break guardrails).

### Explicit non-goals (out of scope)

- **The per-event template/layout system.** This spec stays within Template #1 (the current single layout). Swappable shells, a template library, and a template-picker are a separate, later project with their own spec. Feature A and B are forward-compatible with it: the renderer guardrails and the upload pipeline carry over unchanged. Only the *admin UI placement* of these controls may later be reorganized into a template-picker flow — accepted tradeoff.
- No new `*Ar` bilingual fields (none of these controls add user-facing prose).
- No changes to the gradient accent line (stays `primaryColor → secondaryColor`).

### No new module gate

Both features extend always-present surfaces (`EventBranding` editing and the `formBuilder` module, which defaults `true`). Per CLAUDE.md, module gates are for *optional capabilities*; these are config on existing surfaces, so **no new `EventModules` boolean is added.** Branding API stays `authorizeEvent({ role: "editor" })`; form-fields PATCH already uses `authorizeEvent({ role: "editor" })`.

---

## 3. Stage 0 — Pre-flight audit (required before any code)

Confirm against the real repo and surface findings before implementing. Specifically resolve:

1. **Vercel Blob storage posture (load-bearing for Stage 3).** The store is in Private mode; the registration page is public, so an uploaded logo must be publicly served. Determine the available path and pick one:
   - (a) a **public Blob store** for branding assets (cleanest — a logo isn't secret), or
   - (b) a **stream-through endpoint** that serves the image publicly (mirrors the visitor FILE pattern; note the handoff lesson that Vercel Blob v2.x has no signed URLs).
   Report which is feasible; **do not build Stage 3 until this is decided.**
2. **Current header render code** in `(public)/register/[eventSlug]/page.tsx`: confirm the hardcoded `#0c0c0e`, the logo fallback chain, and the **current rendered logo height** (so the Feature A default preserves today's look exactly).
3. **Option-grid render path:** confirm which field types use the card grid (`MULTISELECT` confirmed; check whether single-select / `RADIO` render through the same `renderCard`). Feature B's setting applies only to card-grid field types.
4. **FormField storage choice for Feature B:** new typed enum column vs. `metadata` JSON. Spec recommends the typed column (consistent with the existing `order` / `width FieldWidth` Layout section); confirm migration appetite.
5. **Branding read path:** confirm the public `api/register/[eventSlug]` GET selection and the public `Branding` interface so new fields are plumbed through (the redesign already had to add `logoWhiteUrl` to this path).

Surface any bonus items for approval before folding them in.

---

## 4. Schema changes

Follow the project schema workflow: **Neon child branch first**, then `prisma db push`, commit `schema.prisma` alongside. Defaults below are chosen so **every existing event is unchanged** (no backfill required).

### EventBranding (Feature A)

```prisma
headerColor    String?         // null → falls back to #0c0c0e (today's strip)
headerShowLogo Boolean @default(true)   // true = show logo (with text fallback); false = always event-name text
logoHeight     Int?            // header logo height in px; null → current default (confirm in Stage 0). Clamp 24–80 at API.
```

### FormField (Feature B)

```prisma
enum OptionColumns {
  AUTO   // today: 1 col mobile, 2 col desktop
  ONE    // 1 col on all screens
  TWO    // 2 col on all screens (incl. mobile)
}

optionColumns OptionColumns @default(AUTO)
```

`AUTO` default = zero behavior change for existing fields.

---

## 5. Feature A — Header & logo controls

### A1. Header color + auto-contrast

- Header strip background = `headerColor ?? "#0c0c0e"`.
- **Title/text color is derived, not stored:** compute relative luminance of the resolved header color → use near-black text on light headers, white on dark. The admin never manages a separate text color. (Future manual override is a possible later addition, not now.)
- Gradient accent line unchanged.

### A2. Logo / event-name — hard switch

- `headerShowLogo = true`: show logo with **dark/light-aware pick** — dark header → prefer `logoWhiteUrl` then `logoUrl`; light header → prefer `logoUrl` then `logoWhiteUrl`; if neither set → fall back to event-name text.
- `headerShowLogo = false`: **always** show event-name text, even when a logo is configured. (This is the actual "control" — a hard switch, not a fallback.)
- Admin UI warns when the header is light but only `logoWhiteUrl` (white logo) is set — a white logo on a light strip disappears.

### A3. Logo size

- Rendered header logo height = `logoHeight ?? <current default>`, clamped 24–80px at the API.
- Admin control: a **slider with a live preview**, bounded to the clamp range. No free-form pixel entry (prevents a value that breaks the strip).

### A4. Upload instead of link

- Add an **upload** affordance to the logo fields (Logo URL, White/Light logo, Favicon). Pasting a URL still works; upload becomes the primary path and removes the "which URL format works" failure.
- Upload writes to the public destination chosen in Stage 0 and stores the resulting URL in the existing `logoUrl` / `logoWhiteUrl` / `faviconUrl` column.
- **Gated on the Stage 0 Blob decision — do not build before it's resolved.**

### A5. Cleanup (folds in here)

- The **Header Image URL** field (`headerImageUrl`) was retired from the public page in the redesign but still shows as a prominent, fillable field in the Images tab — which already caused a real misconfiguration (a logo dropped into it silently does nothing). Relabel or hide it so nobody else hits that. Keep the column (schema/DTO untouched); this is admin-UI only.

---

## 6. Feature B — Per-field option columns

### B1. Setting

- Per-field `optionColumns`: `AUTO` (default) / `ONE` / `TWO`, shown in the form-builder for card-grid field types only (per Stage 0 finding).
- Mapping in the renderer:
  - `AUTO` → `grid-cols-1 sm:grid-cols-2` (today's behavior)
  - `ONE` → `grid-cols-1`
  - `TWO` → `grid-cols-2` (including mobile — the long-list fix)

### B2. No-break guardrails (apply to ALL settings, both screens)

These are the load-bearing part — they make any column choice safe on phone and desktop:

- **Equal-height cards per row:** rely on grid `align-items: stretch` (default) so a tall card (long label) raises its row-neighbor to match — no crooked grid.
- **Clean label wrapping:** `overflow-wrap: anywhere` on the label so long labels (e.g. "تعليم وورش عمل ( يستلزم وجود شهادة تدريب معتمد )") wrap and grow the card taller instead of overflowing or shrinking text.
- **Overflow clamp:** grid columns use `minmax(0, 1fr)` so content can't push a column past the container.
- **Width cap preserved:** the card's existing max-width (640px) keeps `TWO` tidy on big screens (no full-bleed stretch) and `ONE` constrained.

RTL must be preserved (Arabic forms). Selected-state theming off `primaryColor + alpha tint` (from the redesign) is unchanged.

---

## 7. Staging plan

Each stage ends with the CLAUDE.md four-step close-out (commit `feat(stageN): …` → push → Preview green → report). User green-lights each stage. **Mockup the admin Header card before Stage 2** (category-grid behavior already mocked and approved).

| Stage | Scope | Schema? |
|---|---|---|
| **0** | Pre-flight audit (§3) | — |
| **1** | Feature A: schema (3 cols) + branding API plumbing + public renderer (color + auto-contrast, hard switch, dark/light logo pick, size). Admin still sets via existing text fields. | yes |
| **2** | Feature A: admin **Header card** UI — color picker, logo/name toggle, size slider + live preview, light-header/white-logo warning, retire/relabel Header Image URL field. | — |
| **3** | Feature A: **upload-instead-of-link** (per Stage 0 Blob decision). | — |
| **4** | Feature B: schema (`OptionColumns`) + renderer mapping + guardrails + form-builder per-field select. | yes |

### Acceptance criteria

- **Stage 1:** existing events render identically (defaults preserve current look). Setting `headerColor` to a light hex flips title text to dark and reads cleanly. `headerShowLogo=false` shows event name even with a logo set. `logoHeight` resizes the header logo within clamp.
- **Stage 2:** admin can set all of A1–A3 from one Header card with a live preview; saving persists and the public page reflects it. Header Image URL no longer presents as a working logo input. Light-header + white-only-logo shows the warning.
- **Stage 3:** admin can upload a logo file and see it render on the public page (publicly served); pasted URLs still work.
- **Stage 4:** Productive Families' category field set to `TWO` shows 2 columns on mobile with the long label wrapping cleanly and rows equal-height; `AUTO` fields are unchanged; `ONE` forces single column. Verified at phone and desktop widths on Preview.

---

## 8. Decisions log (carried from design discussion)

- **Header text color is auto-derived, not a stored setting** — fewer knobs, always readable.
- **Logo/name is a hard switch**, not a fallback — `false` = text even when a logo exists.
- **Logo size is a bounded slider with live preview**, not free-form px — can't break the strip.
- **Upload is added but URL paste is retained** — upload is primary, URL is escape hatch.
- **`optionColumns` is three-state (AUTO/ONE/TWO)**, not a bare 1/2 — because today's behavior is already responsive (1 mobile / 2 desktop); a bare toggle couldn't represent it, and `AUTO` default means no existing field regresses.
- **No new module gate** — config on existing surfaces.
- **Template system explicitly deferred** — these are features of Template #1, forward-compatible with the future template library.

## 9. Open items to resolve in Stage 0

- Blob public-serving mechanism (public store vs stream-through). **Blocks Stage 3 only** — Stages 1, 2, 4 can proceed without it.
- Exact current header logo height (to set the `logoHeight` default).
- Which field types share the card-grid renderer (scopes the Feature B setting).
