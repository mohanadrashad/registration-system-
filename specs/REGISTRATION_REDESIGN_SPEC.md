# Registration Page Redesign — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved. 2 sequential stages, each a mergeable PR.
**Scope:** Visual redesign of the public registration page. **Event-agnostic** — the shared renderer is restyled, so every event's registration page gets the new look.

---

## Overview

Restyle the public registration page into La Gloire's brand language: a **dark branded header** (white logo + green→magenta gradient accent) sitting on top of a **clean, centered white form card** with crisp fields and a **category card-grid** (replacing the current MULTISELECT pill wall). Brand-accent colors come from `EventBranding`, so each event themes its own gradient.

**Reference design:** dark header strip (near-black) with the white logo, a 3px green→magenta gradient line beneath it, then a white card body — centered single column, soft-gray page behind. Crisp inputs with a green focus ring. Gradient submit button. Category field rendered as a 2-column card grid.

## What this is NOT

- **Not a form-builder change.** Field types, validation, conditional (`showIf`) logic, widths, and the `FormField` data model are untouched.
- **Not per-event custom code.** One shared renderer; all events benefit.

---

## Current state (from pre-flight audit)

- **File:** `src/app/(public)/register/[eventSlug]/page.tsx` (~1379 lines, client component). `renderField(field)` if-chain at **~line 563**.
- **Current layout:** split branding-panel + form-panel. Stage 1 **replaces this shell** with a centered card.
- **Input style literal** repeated across ~7 input renderers: `h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors`. No central wrapper.
- **MULTISELECT** renders as a pill wall — `renderPill` **~lines 813–859**, branch **~line 803**. Container `flex flex-wrap gap-2`. Pills `px-3 py-1.5 rounded-full text-sm border`, selected uses `backgroundColor: primaryColor`. Handles `maxSelections`, `showSelectionCounter`, at-max disabled + Tooltip, and an "Other" option + `OtherTextInput`.
- **Field grid container:** `grid grid-cols-2 gap-4` (**~line 1302**); `widthClass` **~567–572**.
- **Branding** read via `branding` prop: `primaryColor`, `secondaryColor`, `backgroundColor`, `textColor`, `logoUrl`, `headerImageUrl`, `welcomeTitle/Ar`, `welcomeMessage/Ar`, `customCss`. **Does NOT read `logoWhiteUrl`** (exists in the branding admin + schema, just not on the public `Branding` interface).
- **customCss** injected as `<style dangerouslySetInnerHTML>` **~996–998**. **RTL** via `dir` on root (**~1007 / 1064**); `lang` defaults to `"ar"`.

---

## Brand tokens

- Green `#7EC43F`, Magenta `#CB1681`.
- **Gradient** = `linear-gradient(90deg, primaryColor, secondaryColor)`, falling back to green→magenta if `secondaryColor` is unset.
- **Dark header bg:** `#0c0c0e` (near-black — matches the logo's own background so the white logo blends).
- **Header logo:** use `logoWhiteUrl` (the white logo). Add `logoWhiteUrl` to the public `Branding` interface + GET selection; fall back to `logoUrl` if unset.

---

## Stage 1 — Page shell + field styling (shared)

Restructure the page shell and restyle fields. **This is layout JSX + className work, NOT pure CSS** — state that in the PR.

**Layout:**
- Replace the split-panel shell with a **centered single column**: page background soft gray (`#fafafa`); a centered white card (max-width ~460px, radius ~16px, subtle 0.5px border).
- **Card top:** a dark header strip (`#0c0c0e`, rounded top corners to match the card) holding the white logo (`logoWhiteUrl`), centered, generous padding.
- Directly beneath the header: a **3px green→magenta gradient accent line**, full card width.
- **Card body** (white): `welcomeMessage` as a centered subtitle, then the form.
- Mobile: card is full-width with side margins (no split to worry about).

**Fields:**
- Replace the repeated input literal with a crisp style: white bg, `1px solid #e3e4e8` border, ~11px radius, ~46px height, **green focus ring** (border `#7EC43F` + `box-shadow 0 0 0 3px rgba(126,196,63,.16)`). Apply uniformly to TEXT/EMAIL/PHONE/NUMBER/TEXTAREA/SELECT/COUNTRY/DATE/TIME/etc. **Prefer extracting ONE shared className constant (or a small `FormInput` wrapper) over editing 7 literals separately.**
- Labels ~13.5px, weight 500, `#3a3b41`; required asterisk red (`#e2574c`) — keep current convention.
- **Submit button:** green→magenta gradient (`primaryColor→secondaryColor`, green→magenta fallback), white text, ~48px, radius ~11px, full width.

**Preserve (do not change behavior):**
- All `renderField` branches and field-type behavior.
- The width system (FULL/HALF/THIRD) — **do NOT touch here** (THIRD bug is a separate ticket).
- `showIf` conditional logic, language switch, RTL, `customCss` injection.
- The multi-step **stepper** for multi-step phases — restyle to match. It won't appear for single-step events like Productive Families.

**Add:**
- `logoWhiteUrl` to the public `Branding` interface + GET selection; use it on the dark header (fallback `logoUrl`).

**Deliverable:** every event's registration page renders as a centered card with a dark branded header, crisp fields, and a gradient button. Field rendering unchanged. No form-builder impact.

---

## Stage 2 — MULTISELECT category card grid (shared)

Rebuild the MULTISELECT renderer (`renderPill` ~813–859 / branch ~803) from a pill wall into a **2-column card grid**.

- Container: `grid grid-cols-2 gap-2` (single column on narrow mobile).
- Each option = a bordered card: `1px #e3e4e8` border, ~11px radius, padding, a **leading radio-dot** + the option label. **NO per-option icons** — the options data (`{value, label, labelAr}`) has no icon field; icons would require an options-schema + form-builder change and are out of scope.
- **Selected state:** green border (`#7EC43F`) + faint green tint (`#f4faec`) + filled green radio dot.
- **Preserve ALL existing MULTISELECT behavior:** `maxSelections` enforcement, the at-max disabled/tooltip state, `showSelectionCounter`, the "Other" option + `OtherTextInput`. Single-select (`maxSelections: 1`) and multi (>1) both work — only the **visual** changes, not the toggle logic.
- Applies to **every MULTISELECT field on any event** (generic).

**Deliverable:** the category wall becomes a clean card grid everywhere MULTISELECT is used; behavior identical.

---

## Deferred (separate tickets — do NOT do here)

- THIRD-width bug (THIRD renders as HALF; needs a `grid-cols-6` rework).
- Section group headers (`FormField.section` declared but unread).
- `footerText` rendering (declared, unused).
- Per-event light/dark header toggle (for events that later want a light header).
- Per-option icons for the category grid (needs an options-schema change).

---

## Acceptance criteria

**Stage 1:**
- [ ] Page renders as a centered white card with a dark header bearing the white logo (`logoWhiteUrl`, fallback `logoUrl`) and a green→magenta gradient accent line.
- [ ] All input types use the new crisp style with the green focus ring.
- [ ] Submit button is the green→magenta gradient.
- [ ] Field rendering, widths, `showIf`, RTL, language switch, and `customCss` are unchanged in behavior.
- [ ] Multi-step events still show a (restyled) stepper; single-step events do not.
- [ ] Verified on Vercel Preview for Productive Families + at least one other event.

**Stage 2:**
- [ ] MULTISELECT renders as a 2-col card grid with radio dots and a selected state.
- [ ] `maxSelections`, at-max disable, counter, and "Other" all still work.
- [ ] No icons assumed; works on real options data.
- [ ] Verified on Preview with Productive Families' category field (20 options).

**Whole feature:**
- [ ] No form-builder or data-model changes.
- [ ] Bilingual (AR/EN) + RTL correct.
- [ ] Brand-accent gradient driven by `EventBranding` (`primaryColor→secondaryColor`) with green→magenta fallback.

---

## Config steps (outside code — Mohanad, in the admin)

- Set Productive Families branding: `primaryColor = #7EC43F`, `secondaryColor = #CB1681` (so the gradient renders green→magenta).
- Upload the **white** logo to `logoWhiteUrl` for Productive Families (the dark header uses it). Ideally a **transparent-background** PNG/SVG for crisp edges.

---

## Notes for Claude Code

- Pre-flight audit is already done (this spec encodes it). **Re-verify the exact line numbers before editing** — the file is ~1379 lines and may have shifted.
- **Stage 1 restructures the page shell** (split → centered card). It is layout JSX + className work, **not pure CSS** — say so in the PR.
- **Extract ONE shared input className/wrapper** rather than editing the literal in ~7 places.
- **Do NOT add per-option icons** (no icon field in options data).
- **Do NOT change the width system or fix THIRD** here.
- Presentation only — services and validations are untouched.
- Both stages event-agnostic (shared renderer). One commit per sub-deliverable; each stage its own PR; Vercel Preview green before reporting. Include a before/after screenshot note in each PR.

---

*Approved for implementation, stage by stage, with Preview verification between stages.*
