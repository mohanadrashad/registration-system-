"use client";

/**
 * <FieldTextFields>
 *
 * The "Display text" section of the Add / Edit Field dialog in the form-
 * builder. Renders three <BilingualInput> pairs — Label, Placeholder, Help
 * text — each with a small caption explaining its purpose. Shared between
 * both dialogs (mirrors the pattern used by OptionsEditor).
 *
 * Layout-only field types (HEADING, DIVIDER, PARAGRAPH) don't render an
 * input on the public registration page, so the concepts of "placeholder"
 * and "help text" don't apply. For those types the entire section
 * collapses to nothing — the caller renders <FieldTextFields> the same
 * way regardless, the component handles the gating.
 *
 * The component is purely controlled: it never owns state. The caller
 * passes the current values and onChange handlers; the caller owns the
 * FormField object that's POSTed/PATCHed on save.
 */

import { FieldType } from "@prisma/client";
import { Label } from "@/components/ui/label";
import { BilingualInput } from "@/components/admin/bilingual-input";

/**
 * Per-type behavior matrix. Drives which of the three pairs render:
 *
 *   HEADING   → Label only. Renderer is `<h3>{label}</h3>` — no
 *               placeholder concept, no subtitle affordance.
 *   PARAGRAPH → Label only. Renderer is `<p>{label}</p>` — same shape
 *               as HEADING, just smaller text.
 *   DIVIDER   → Nothing. Renderer is `<hr>` with no text at all; the
 *               entire section is suppressed and the API/client
 *               validation must not require a label for this type.
 *   default   → All three pairs (Label, Placeholder, Help text). For
 *               every other field type — TEXT/EMAIL/PHONE/TEXTAREA/
 *               NUMBER/SELECT/MULTISELECT/RADIO/CHECKBOX/DATE/TIME/
 *               DATETIME/COUNTRY/PHONE_COUNTRY/FILE/HIDDEN.
 */
type DisplayTextLayout = "label-only" | "hidden" | "full";

function getLayout(fieldType: FieldType): DisplayTextLayout {
  if (fieldType === "DIVIDER") return "hidden";
  if (fieldType === "HEADING" || fieldType === "PARAGRAPH") return "label-only";
  return "full";
}

export interface FieldTextFieldsProps {
  fieldType: FieldType;
  label: string;
  labelAr: string;
  placeholder: string;
  placeholderAr: string;
  helpText: string;
  helpTextAr: string;
  onChange: (patch: {
    label?: string;
    labelAr?: string;
    placeholder?: string;
    placeholderAr?: string;
    helpText?: string;
    helpTextAr?: string;
  }) => void;
}

export function FieldTextFields({
  fieldType,
  label,
  labelAr,
  placeholder,
  placeholderAr,
  helpText,
  helpTextAr,
  onChange,
}: FieldTextFieldsProps) {
  const layout = getLayout(fieldType);
  if (layout === "hidden") {
    // DIVIDER: renderer is just <hr>, no text. Section disappears
    // entirely; the addField/PATCH validation also relaxes the label
    // requirement for DIVIDER (see form-builder/page.tsx and
    // form-fields/route.ts).
    return null;
  }

  // Caption for HEADING/PARAGRAPH explains that the label IS the
  // visible text, so admins don't go hunting for a separate "heading
  // text" or "paragraph text" field.
  const labelCaption =
    fieldType === "HEADING"
      ? "Shown as the section heading on the registration form."
      : fieldType === "PARAGRAPH"
      ? "Shown as info text on the registration form."
      : "The field’s name. Shown above the input.";

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-3">
      <Label className="text-sm font-medium text-muted-foreground">
        Display text
      </Label>

      <div className="space-y-1">
        <BilingualInput
          label="Label"
          idPrefix="field-text-label"
          valueEn={label}
          valueAr={labelAr}
          onChangeEn={(v) => onChange({ label: v })}
          onChangeAr={(v) => onChange({ labelAr: v })}
        />
        <p className="text-xs text-muted-foreground">{labelCaption}</p>
      </div>

      {layout === "full" && (
        <>
          <div className="space-y-1">
            <BilingualInput
              label="Placeholder"
              idPrefix="field-text-placeholder"
              valueEn={placeholder}
              valueAr={placeholderAr}
              onChangeEn={(v) => onChange({ placeholder: v })}
              onChangeAr={(v) => onChange({ placeholderAr: v })}
            />
            <p className="text-xs text-muted-foreground">
              Hint text shown inside an empty input. Disappears when the
              visitor starts typing.
            </p>
          </div>

          <div className="space-y-1">
            <BilingualInput
              label="Help text"
              idPrefix="field-text-help"
              multiline
              rows={2}
              valueEn={helpText}
              valueAr={helpTextAr}
              onChangeEn={(v) => onChange({ helpText: v })}
              onChangeAr={(v) => onChange({ helpTextAr: v })}
            />
            <p className="text-xs text-muted-foreground">
              Shown below the input as an instruction or explanation.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
