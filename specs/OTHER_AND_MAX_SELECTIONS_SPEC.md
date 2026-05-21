# "Other" Option + Max Selections — Specification

**Target repo:** `mohanadrashad/registration-system-`
**Author:** Mohanad + Claude
**Status:** Approved for implementation as a single-stage feature.
**Prerequisites:** All previous features (Phase-Based Forms, Phase Selections, Attendee Detail Redesign, Category-Based Phase Logic, Translation + Bulk Options) are deployed and stable in production.

---

## Overview

Today, SELECT / MULTISELECT / RADIO fields force the visitor to pick from a closed list. For predictable lists (countries, sizes) this works. For open-ended lists (product categories, dietary needs, accommodations) it's restrictive — admins can't anticipate every answer, and the form becomes a barrier instead of a data-collection tool.

This spec adds two related controls to option-bearing fields in one PR:

1. **"Other" option** — a per-field toggle that appends an "Other (please specify)" choice and reveals a free-text input when selected. Applies to SELECT / MULTISELECT / RADIO.

2. **Maximum selections** — a per-field limit on how many options a visitor can pick. Applies to MULTISELECT only. Includes an optional selection counter.

They share a PR because they touch the same surfaces (Field editor dialog, public registration renderer, options JSON shape, validation framework) and the productive-families case wants both: 20 product categories with "Other" enabled and a "pick up to 5" cap.

---

## Goals

### "Other" feature
- An admin can enable "Other" per option-bearing field (SELECT, MULTISELECT, RADIO) via a toggle in the form-builder.
- When enabled, the public form appends an "Other (please specify)" choice to the field's options.
- Selecting "Other" reveals a free-text input where the visitor types their custom answer.
- The custom text is required when "Other" is selected AND the field itself is required.
- The custom text is stored in `Registration.formData` alongside the field's value.
- Admin can customize the choice label and text-input placeholder, in both English and Arabic.
- Sensible defaults are provided so admins enabling the toggle don't have to write copy.

### Max selections feature
- An admin can set a maximum number of selections on a MULTISELECT field.
- Visitors cannot pick more than the limit; options past the limit are disabled with a tooltip.
- An optional selection counter ("2 of 3 selected") shows below the field when the limit is set.
- Server-side validation rejects submissions that exceed the limit.

### Both features
- Fields without the new toggles / limits continue working with zero behavior change.
- Bilingual rendering through the existing AR/EN switching pattern.
- The features compose: a MULTISELECT can have both "Other" AND a max-selections limit. "Other" counts as one selection toward the cap.

## Non-Goals

- Multiple "Other" entries per multi-select field. Visitor comma-separates inside one text field.
- Conditional logic based on "Other" being selected.
- "Other" on CHECKBOX (boolean, no options array), COUNTRY (closed list by nature), HEADING / DIVIDER / PARAGRAPH (no input).
- Max-selections on SELECT (always exactly 1) or RADIO (always exactly 1).
- Minimum-selections requirement. Out of scope; existing "required" handles "at least 1."
- Validation of the custom text beyond "required when Other is selected."
- Schema changes. Both features live in existing JSON columns.

---

## Architecture

No new tables, no schema changes. Two existing JSON columns hold all new data.

### `FormField.options` — wrapped shape with optional config

Today, `options` is `FieldOption[]` where each option is `{ label, labelAr?, value }`. We accept both that legacy shape AND a new wrapped shape:

```ts
type FormFieldOptionsLegacy = FieldOption[];

type FormFieldOptionsWrapped = {
  options: FieldOption[];          // the regular choices
  other?: OtherConfig;             // undefined = "Other" feature off
  maxSelections?: number;          // undefined or 0 = no limit (MULTISELECT only)
  showSelectionCounter?: boolean;  // defaults to true when maxSelections is set
};

type OtherConfig = {
  enabled: true;                   // present-and-true = feature on
  label?: string;                  // "Other (please specify)" if absent
  labelAr?: string;                // "أخرى (يرجى التحديد)" if absent
  placeholder?: string;            // "Please specify" if absent
  placeholderAr?: string;          // "يرجى التحديد" if absent
};
```

A new parser helper `parseFormFieldOptions(raw): { options, other?, maxSelections?, showSelectionCounter? }` handles both shapes. Every surface that reads `FormField.options` routes through this helper.

A new serializer `serializeFormFieldOptions(parsed)`:
- Writes the wrapped shape only if `other` or `maxSelections` is set
- Otherwise writes the legacy array shape (preserves backwards compatibility for fields that don't use the new features)
- This keeps the DB clean — only fields that need the new features pay the wrapping cost

### `Registration.formData` — naming-convention sibling for "Other"

Today, `formData[fieldName]` stores the visitor's answer:
- SELECT / RADIO → `string` (the chosen option's `value`)
- MULTISELECT → `string[]` (array of chosen `value`s)

When "Other" is enabled and selected, we add a sibling key:
- `formData[fieldName]` → `"__other"` for SELECT/RADIO, or contains `"__other"` for MULTISELECT
- `formData[fieldName + "_other"]` → the custom text

**Why `"__other"`** as the reserved value: double-underscore prefix is unambiguous namespacing. Real option values are slugified labels, which can't start with `__`.

**Why `_other`** as the suffix: existing code reading `formData[fieldName]` continues to work unchanged. The sibling key is implicit but easy to discover. Admin-facing surfaces (registration export, attendee detail, badge generator, email templates) need to know about the suffix; validation needs to know about both.

### `Registration.formData` — no change for max-selections

Max-selections only constrains how many values are stored; the storage shape (`string[]`) is unchanged.

---

## Behavior Specifications

### Admin: enabling "Other" in the form-builder

In the `FormField` Edit/Add dialog, when the field type is SELECT, MULTISELECT, or RADIO, a new section appears below the existing Options editor:

```
─── Other option ─────────────────────────────────────────

  ☐ Allow "Other" with custom text
     When enabled, visitors can pick "Other" and type a custom answer.

  [the rest of this section is hidden when the toggle is off]
```

When the toggle is on, two BilingualInput pairs appear:

```
  ─── Other option ───────────────────────────────────────

  ☑ Allow "Other" with custom text

    Choice label (English)        [⇄ Translate]        Choice label (Arabic)
    [Other (please specify)             ]               [أخرى (يرجى التحديد) ]
    The label of the "Other" choice in the dropdown/radio list.

    Custom text placeholder (English) [⇄ Translate]   Custom text placeholder (Arabic)
    [Please specify                     ]             [يرجى التحديد               ]
    Hint shown inside the text input that appears when Other is selected.
```

**Defaults if admin leaves fields blank:**
- `label`: "Other (please specify)"
- `labelAr`: "أخرى (يرجى التحديد)"
- `placeholder`: "Please specify"
- `placeholderAr`: "يرجى التحديد"

Defaults render at attendee-view time (resolved in the renderer). They are NOT written to `OtherConfig` on save — only admin-customized values persist. This lets us evolve defaults later without touching old rows.

### Admin: configuring max selections (MULTISELECT only)

Below the "Other option" section, when the field type is MULTISELECT, a new section appears:

```
─── Maximum selections ───────────────────────────────────

  Limit how many options visitors can pick.

  Maximum   [3]   (leave blank or 0 for no limit)

  ☑ Show selection counter on the form
     Visitors see "2 of 3 selected" below the field.
```

The number input accepts 0 (no limit), or any positive integer up to the option count. Server validates: `maxSelections <= options.length`. If admin sets it higher than option count, save with a warning OR clamp to option count (TBD in mockup).

When the field type is NOT MULTISELECT, this section is hidden entirely. Changing the type back to MULTISELECT restores the section with previously-saved values (or defaults if none).

### Admin: field types that don't support these features

- **Other:** hidden for TEXT, EMAIL, PHONE, TEXTAREA, NUMBER, DATE, TIME, DATETIME, FILE, HIDDEN, COUNTRY, PHONE_COUNTRY, CHECKBOX, HEADING, DIVIDER, PARAGRAPH.
- **Max selections:** hidden for everything except MULTISELECT.

The dialog reads the current Type value (already tracked in component state) and conditionally renders each section.

### Public form: SELECT / RADIO with "Other"

When the field has `other.enabled = true`:

- The rendered option list gets an additional entry at the bottom with the reserved value `"__other"` and the label `other.label` (or default, with AR fallback).
- The visitor sees it like any other option.
- When the visitor selects "Other," a text input appears below the dropdown/radio group:
  ```
  ┌──────────────────────────────────────────┐
  │ [Product Category                  ▾]    │
  │                                          │
  │ Please specify  *                        │
  │ [your custom answer                   ]  │
  └──────────────────────────────────────────┘
  ```
- The text input's label uses a default ("Please specify") for clarity. The placeholder uses `other.placeholder` (or its default).
- When the visitor selects a non-Other option, the text input is hidden and any value it held is cleared from local form state.

### Public form: MULTISELECT with "Other"

- The "Other" entry appears at the bottom of the option list.
- Selecting it (alongside any regular options) reveals the text input below the field.
- Deselecting "Other" hides the input and clears its value.

### Public form: MULTISELECT with max-selections

When `maxSelections` is set to N:

- Each unselected option that would exceed N if checked becomes disabled (grayed out with `cursor-not-allowed`).
- Hovering a disabled option shows tooltip: *"Maximum N selections reached. Uncheck one to choose a different option."*
- If `showSelectionCounter` is true (default), below the field renders: *"2 of 3 selected"* (English) / *"2 من 3 محدد"* (Arabic).
- The counter color shifts subtly when at the limit (e.g., text-muted-foreground → text-foreground) to provide visual feedback.

### Public form: MULTISELECT with BOTH Other and max-selections

- "Other" counts toward the max-selections limit like any option.
- If `maxSelections = 3` and the visitor picks 2 regular options + Other, that's 3/3. Other regular options are now disabled until the visitor unchecks one.
- The custom text input still appears alongside the multiselect when "Other" is in the selection set.

### Public form: validation

**Other:**
- If field is required AND visitor selected `"__other"`, the custom text input must be non-empty.
- Error: *"Please specify your answer"* (English) / *"يرجى تحديد إجابتك"* (Arabic).
- Standard inline-error rendering, same pattern as other field validations.
- For non-required fields, empty custom text is allowed.

**Max-selections:**
- Client-side: options past the limit are disabled (preventive — visitor can't even try).
- Server-side: POST `/api/register/[eventSlug]` validates `formData[fieldName].length <= maxSelections`. Returns 400 with clear message if exceeded.

### Submission shape

Example payload for a SELECT field named `product_category` with "Other" enabled:

```json
{
  "formData": {
    "first_name": "Mohanad",
    "product_category": "__other",
    "product_category_other": "Calligraphy supplies"
  }
}
```

Example for MULTISELECT named `accommodations` with both Other AND `maxSelections = 3`:

```json
{
  "formData": {
    "accommodations": ["wheelchair_access", "dietary", "__other"],
    "accommodations_other": "I bring a service dog"
  }
}
```

### Admin: viewing submission data

Existing surfaces that read `Registration.formData` need to handle the `_other` sibling:

- **Attendee detail page** (registration answers card): when value is `"__other"` or contains `"__other"`, display as `"Other: <custom text>"`. Falls back to just `"Other"` if sibling is missing.
- **Statistics page**: count `"__other"` as a regular bucket in per-option counts. Custom texts aren't aggregated (each one is unique by definition).
- **CSV export**: two columns per Other-enabled field — the regular value column and a sibling column named `<fieldname>_other`.
- **Badge generator**: badge templates referencing `{{fieldName}}` interpolate `"Other: <custom text>"` if `"__other"` is selected, truncated to ~30 chars for layout safety.
- **Email templates**: same `{{fieldName}}` substitution behavior as badge generator.

### Edge cases

- **Toggle disabled after submissions exist.** Existing submissions keep `_other` data. Renderer just stops showing the Other choice for new visitors. Old submissions still display custom text correctly in admin views.
- **Max-selections lowered after submissions exist.** Existing submissions with more selections than the new limit are preserved (no automatic data trimming). Renderer just enforces the new limit for new visitors. Old submissions display all stored values.
- **Bulk paste interaction.** The BulkPaste dialog (from previous PR) adds regular options. It does NOT touch the `other` config or `maxSelections`. Admin enables those separately via the toggles.
- **A regular option named "Other".** Allowed. Regular option has slugified value like `other`; reserved Other-toggle value is `__other`. They're distinct. Admins might want to avoid this for clarity, but the system doesn't enforce.
- **`maxSelections` greater than options count.** Server-side validation accepts (since the visitor can never exceed options count anyway). Admin UI shows a small warning ("Maximum is higher than your option count — the limit will be the option count in practice").
- **Field type changed from MULTISELECT to SELECT after `maxSelections` is set.** The `maxSelections` value is preserved in the JSON but not enforced (only MULTISELECT renders consult it). Changing back to MULTISELECT restores the limit.

---

## Schema

**No schema changes.** Everything lives in the existing `FormField.options` JSON and `Registration.formData` JSON columns.

---

## Implementation Stages

Single-stage feature. One PR.

### Stage 1 — Full feature

**Schema parsing helpers:**
- New `src/lib/form-builder/options-parse.ts` with `parseFormFieldOptions(raw)` and `serializeFormFieldOptions(parsed)`. Handles legacy `FieldOption[]` and new wrapped shape transparently. Used by every surface that reads or writes the options JSON.

**Admin UI:**
- New `<OtherOptionEditor>` component in `src/components/admin/other-option-editor.tsx`. Toggle + collapsible body with two BilingualInput pairs.
- New `<MaxSelectionsEditor>` component in `src/components/admin/max-selections-editor.tsx`. Number input + counter toggle.
- Wire both into the `FormField` Add and Edit dialogs in `form-builder/page.tsx`, conditionally rendered based on field type.
- Save/load uses the parser helper to round-trip the JSON shape.

**Validation:**
- Update `src/lib/validations/form-field.ts` to accept the new wrapped options shape. Optional `other`, optional `maxSelections`, optional `showSelectionCounter`.
- Server-side validation in POST `/api/register/[eventSlug]`:
  - If `maxSelections` is set on a MULTISELECT field, enforce the count.
  - If `other.enabled` and field is required and value contains `"__other"`, enforce non-empty `_other` sibling.

**Public registration page:**
- `(public)/register/[eventSlug]/page.tsx` updated to:
  - Use the parser helper to read field options.
  - Append `"__other"` choice when `other.enabled`.
  - Conditionally render text input when `"__other"` is selected.
  - Disable options past `maxSelections` on MULTISELECT.
  - Render the selection counter when `showSelectionCounter` is on.
  - Wire into the submission payload: include `<fieldName>_other` in `formData` when custom text has content.
  - Run validation for both Other and max-selections.
  - Use existing AR/EN switching pattern for choice label, placeholder, and counter copy.

**Admin display surfaces:**
- New helper `formatFieldValueForDisplay(field, formData)` that returns `"Other: <custom text>"` when value contains `"__other"`. Used by:
  - Attendee detail page (registration answers card)
  - Email template variable substitution
  - Badge generator variable substitution
- CSV export: emit two columns for Other-enabled fields.
- Statistics page: count `"__other"` as a regular bucket; display label as "Other" (or custom label).

**Pre-flight audit (required before coding):**
- Confirm every code path that reads `Registration.formData[fieldName]`.
- Confirm every code path that iterates `FormField.options` (none should assume legacy shape exclusively).
- Confirm badge generator and email variable substitution logic.
- Confirm CSV export structure.
- Confirm portal phase submission rendering (post-reg phases can have option-bearing FormFields too).
- Report any deviations before mockups.

**Visual mockups (required before coding):**
- Mockup A: `<OtherOptionEditor>` and `<MaxSelectionsEditor>` placement within the Add/Edit Field dialog. Section header pattern matching "Display text" from Stage 1b.
- Mockup B: Public registration page — how the "Other" choice + revealed text input look, how the disabled options + counter look on MULTISELECT with max-selections, and how they combine when both are active.

**Deliverable:** end-to-end "Other" + max-selections support, with bilingual customization, validation, and clean admin display of submission data including custom text.

---

## Quality Disciplines

### Audit before code

Same pattern as every previous stage. Audit must catch:
- All read paths for `Registration.formData[fieldName]` (admin display, exports, badges, emails)
- Any code that iterates `FormField.options` assuming the legacy array shape
- Any code that assumes `formData[fieldName]` is a string or string array without considering reserved values

### Mockups before code

Form-builder dialog is dense. Adding two new sections (Other, Max selections) needs careful placement. Both mockups need approval before code.

Public registration page is a public-facing surface. Visual changes there are higher-risk than admin-only changes. Mockup needs approval.

### Staging-first

- No DB migration (code-only).
- Deploy to Preview first. Verify against the productive-families event: enable "Other" + `maxSelections = 5` on the product-category MULTISELECT, register as a test attendee picking 4 regular categories + "Other: Pottery," verify submission data and admin display.

### Backwards compatibility

- Legacy `FieldOption[]` options shape continues to work.
- Existing Registration rows untouched.
- Fields without the new toggles render exactly as before — no extra column, no extra prefix, no behavior change.
- Serializer writes the legacy shape when neither new feature is enabled, keeping the DB tidy.

### No new infrastructure

- No new env vars, services, or packages.

### Bilingual

- Admin-facing labels in the two editors are English-only.
- The Other choice label, placeholder, counter text, and error messages follow the existing AR/EN switching pattern.

---

## Acceptance Criteria

### Other feature

- [ ] `<OtherOptionEditor>` renders on Add and Edit Field dialogs when type is SELECT/MULTISELECT/RADIO.
- [ ] Toggle defaults to off. Enabling reveals two BilingualInput pairs with defaults shown as muted placeholders.
- [ ] Translation works on both BilingualInput pairs.
- [ ] Save persists `other` config to FormField.options JSON. Re-opening the dialog shows saved values.
- [ ] Public SELECT field: "Other" choice appears at bottom of dropdown when enabled.
- [ ] Public SELECT field: selecting "Other" reveals custom text input below.
- [ ] Public SELECT field: switching to another option clears custom text from form state.
- [ ] Public RADIO field: same behavior as SELECT.
- [ ] Public MULTISELECT field: "Other" appears at bottom; selecting reveals text input; deselecting hides it.
- [ ] Required-field validation: required + Other selected + empty custom text → error with correct AR/EN copy.
- [ ] Submission shape: `formData[fieldName] === "__other"` (or contains it for multiselect), `formData[fieldName + "_other"] === <custom text>`.

### Max selections feature

- [ ] `<MaxSelectionsEditor>` renders on Add and Edit Field dialogs when type is MULTISELECT.
- [ ] Hidden for all other field types.
- [ ] Number input accepts 0 / blank (no limit) or positive integers.
- [ ] Counter toggle defaults to on when `maxSelections` is set.
- [ ] Save persists to FormField.options JSON.
- [ ] Public MULTISELECT with limit set: options past limit are visually disabled.
- [ ] Disabled options show tooltip in correct language.
- [ ] Selection counter renders below the field with correct AR/EN copy.
- [ ] Server-side validation rejects submissions exceeding the limit with clear error.
- [ ] `maxSelections = 0` or blank = no limit (existing behavior).

### Combined behavior

- [ ] MULTISELECT with both Other AND maxSelections: "Other" counts as one selection toward the limit.
- [ ] At the limit (including Other), remaining unselected options are disabled.
- [ ] Deselecting "Other" frees up a slot AND clears the custom text input.

### Admin display

- [ ] Attendee detail page renders `"Other: <custom text>"` in place of raw `__other`.
- [ ] CSV export emits two columns for Other-enabled fields.
- [ ] Email template `{{fieldName}}` substitution renders custom text correctly.
- [ ] Badge generator `{{fieldName}}` substitution renders custom text correctly (with truncation).

### Whole feature

- [ ] Pre-flight audit completed; deviations surfaced.
- [ ] Both mockups (admin + public) approved before code.
- [ ] Existing fields without new features enabled continue working with zero behavior change.
- [ ] Bilingual rendering correct throughout (choice label, placeholder, counter, error messages).
- [ ] Productive-families end-to-end test on Preview: 20 categories + "Other" + `maxSelections = 5` → vendor registers picking 4 categories + Other "Pottery" → submission data and admin display all correct.
- [ ] Legacy options shape (without `other` or `maxSelections`) continues to round-trip correctly through parser/serializer.

---

## Open Questions

1. **`maxSelections` > options count.** Clamp to options count, accept the higher value silently, or block at admin UI? Default: **accept silently** (the effective limit is naturally the option count anyway). Show a small admin-side warning hint but don't block save.

2. **Default copy quality.** "Other (please specify)" and "Please specify" — defensible defaults. Revisit if real usage shows different conventions are preferred.

3. **Counter copy in English when 1 selected.** "1 of 3 selected" or "1 of 3 selected" (no singular/plural variation)? Default: **no variation**, use "selected" always. Simpler i18n.

4. **Custom text length cap.** No backend cap today. Default: **no cap.** Standard form submission size limits apply at the platform level.

5. **Trimming.** Trim whitespace from custom text on submit. Default: **yes, trim.** Empty after trim → treat as no custom text (and validation fails for required fields).

6. **What if admin disables either toggle after submissions exist?** Default: **keep the data.** Renderer just stops applying the feature for new visitors. Old submissions display correctly in admin views. Re-enabling restores the full flow.

---

## Notes for Claude Code

- This spec is net-new. It does not replace any earlier spec.
- Single-stage, single-PR feature. The two features ship together because they share too much code to ship separately efficiently.
- Honor existing patterns: services in `src/lib/services/`, validations in `src/lib/validations/`, components in `src/components/admin/`, parser helpers in `src/lib/form-builder/`.
- The reserved value for "Other" is the exact string `"__other"`. Do not use any other convention.
- The suffix for custom text is the exact string `_other`. Do not use any other convention.
- Reuse `<BilingualInput>` from Stage 1a for the OtherOptionEditor's two pairs.
- The parser/serializer helpers MUST be used by every read/write path. Inline JSON access to `FormField.options` is a regression risk.
- Do not add tests unless explicitly asked.
- One commit per logical chunk. Push as a single PR.
- Pre-flight audit + two mockups before any code touches the repo.

---

*Approved for implementation, single-stage, with staging verification before production merge.*
