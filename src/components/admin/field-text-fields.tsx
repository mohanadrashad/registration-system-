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

/** Layout-only field types that don't take user input on the public form.
 *  For these we suppress the entire Display-text section, since labels /
 *  placeholders / help text don't apply (HEADING uses its label as the
 *  heading text, but the bilingual pair is part of FieldTextFields anyway —
 *  the renderer reads field.label directly). */
const LAYOUT_ONLY_TYPES: FieldType[] = ["HEADING", "DIVIDER", "PARAGRAPH"];

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
  if (LAYOUT_ONLY_TYPES.includes(fieldType)) {
    // HEADING / DIVIDER / PARAGRAPH have no input — the whole section is
    // suppressed. The field's label (when present) is still rendered by
    // the public page as heading or info text directly; admins can edit
    // it from a separate place if needed, but for layout types this
    // dialog stays minimal. (HEADING and PARAGRAPH do use `label` as
    // their display text — but we leave that nuance to a future polish;
    // for now the most common case, an input field, gets the full
    // bilingual treatment.)
    return null;
  }

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
        <p className="text-xs text-muted-foreground">
          The field&rsquo;s name. Shown above the input.
        </p>
      </div>

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
    </div>
  );
}
