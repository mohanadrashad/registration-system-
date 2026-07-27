"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { COUNTRIES } from "@/lib/form-builder/countries";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  resolveOtherPlaceholder,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import { FileUploadControl } from "@/components/public/file-upload-control";
import { parseFileFieldMetadata } from "@/lib/validations/file-field-metadata";
import { SectionHeading } from "@/components/public/section-heading";
import { parseHeadingColor } from "@/lib/form-builder/heading-meta";
import type {
  FormField,
  FormFieldValue,
  FormValueMap,
  UploadedFileRef,
} from "./classic-types";
import type { ClassicLang, ClassicT } from "./classic-translations";

// Crisp registration-form input style: white bg, soft border, green
// focus ring driven by brand green (#7EC43F). Shared across all
// inputs/textarea/date-time on the public registration page so the
// look stays consistent and there's one literal to edit, not seven.
// Textarea callers override h-[46px] with h-auto + min-h to keep the
// component multi-line.
const INPUT_CLASSES =
  "bg-white border-[#e3e4e8] rounded-[11px] h-[46px] transition-colors focus-visible:border-[#7EC43F] focus-visible:ring-[#7EC43F]/15 focus-visible:ring-[3px] focus-visible:ring-offset-0";

// SelectTrigger variant: same crisp look, but shadcn's SelectTrigger
// handles its own transitions and doesn't need focus:bg-white. Kept
// structurally separate from INPUT_CLASSES because Select is a
// button-like trigger, not an <input>.
const SELECT_TRIGGER_CLASSES =
  "bg-white border-[#e3e4e8] rounded-[11px] h-[46px] focus-visible:border-[#7EC43F] focus-visible:ring-[#7EC43F]/15 focus-visible:ring-[3px] focus-visible:ring-offset-0";

interface OtherTextInputProps {
  fieldName: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  required: boolean;
}

function OtherTextInput({
  fieldName,
  value,
  onChange,
  label,
  placeholder,
  required,
}: OtherTextInputProps) {
  return (
    <div className="mt-2 space-y-1">
      <Label
        htmlFor={`${fieldName}${OTHER_SUFFIX}`}
        className="text-xs font-medium text-gray-500"
      >
        {label} {required && <span className="text-red-400">*</span>}
      </Label>
      <Input
        id={`${fieldName}${OTHER_SUFFIX}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASSES}
      />
    </div>
  );
}

// MULTISELECT card-grid column classes per FormField.optionColumns (Feature B).
// Static literal strings (no interpolation) so Tailwind's JIT scanner emits
// every class — especially the bare `grid-cols-2` used only here.
const OPTION_COLS: Record<"AUTO" | "ONE" | "TWO", string> = {
  AUTO: "grid-cols-1 sm:grid-cols-2",
  ONE: "grid-cols-1",
  TWO: "grid-cols-2",
};

// One form field of the CLASSIC template, rendered per its FieldType —
// the crisp input styling, "Other" free-text sibling, the primaryColor-
// themed MULTISELECT card grid, FILE upload, and the layout types.
export function ClassicField({
  field,
  formValues,
  onFieldChange,
  lang,
  t,
  eventSlug,
  primaryColor,
  textColor,
}: {
  field: FormField;
  formValues: FormValueMap;
  onFieldChange: (name: string, value: FormFieldValue) => void;
  lang: ClassicLang;
  t: ClassicT;
  eventSlug: string;
  primaryColor: string;
  textColor: string;
}) {
  const isRtl = lang === "ar";
  const handleFieldChange = onFieldChange;

  function getFieldLabel(field: FormField) {
    return isRtl && field.labelAr ? field.labelAr : field.label;
  }
  function getFieldPlaceholder(field: FormField) {
    return isRtl && field.placeholderAr
      ? field.placeholderAr
      : field.placeholder;
  }
  function getFieldHelpText(field: FormField): string | null {
    const v = isRtl && field.helpTextAr ? field.helpTextAr : field.helpText;
    return v && v.trim() !== "" ? v : null;
  }
  function getOptionLabel(option: {
    value: string;
    label: string;
    labelAr?: string | null;
  }) {
    return isRtl && option.labelAr ? option.labelAr : option.label;
  }

    const label = getFieldLabel(field);
    const placeholder = getFieldPlaceholder(field);
    const value = formValues[field.name] ?? "";
    // The form grid is 6 columns (LCM of 2 and 3) so widths compose:
    // FULL = 6/6, HALF = 3/6 (2-across, unchanged 50%), THIRD = 2/6 (3-across,
    // 33%). The old 2-col grid could only do col-span-1, which made THIRD
    // render at 50% — identical to HALF. Static literals so Tailwind's JIT
    // emits them. HALF/FULL proportions are preserved exactly; only THIRD
    // changes (from broken to correct).
    const widthClass =
      field.width === "HALF"
        ? "col-span-3"
        : field.width === "THIRD"
        ? "col-span-2"
        : "col-span-6";

    if (["HEADING", "DIVIDER", "PARAGRAPH"].includes(field.type)) {
      if (field.type === "HEADING") {
        return (
          <SectionHeading
            key={field.id}
            label={label}
            color={parseHeadingColor(field.metadata)}
            className="col-span-6 mt-6 first:mt-0"
          />
        );
      }
      if (field.type === "DIVIDER") {
        return (
          <hr key={field.id} className="col-span-6 my-4 border-gray-200" />
        );
      }
      if (field.type === "PARAGRAPH") {
        return (
          <p key={field.id} className="col-span-6 text-sm text-gray-500">
            {label}
          </p>
        );
      }
    }

    if (field.type === "HIDDEN") {
      return (
        <input
          key={field.id}
          type="hidden"
          name={field.name}
          value={value as string}
        />
      );
    }

    return (
      <div key={field.id} className={`space-y-1.5 ${widthClass}`}>
        <Label
          htmlFor={field.name}
          className="text-xs font-medium text-gray-500"
        >
          {label}{" "}
          {field.required && <span className="text-red-400">*</span>}
        </Label>

        {["TEXT", "EMAIL", "PHONE", "NUMBER", "PHONE_COUNTRY"].includes(
          field.type
        ) && (
          <Input
            id={field.name}
            name={field.name}
            type={
              field.type === "EMAIL"
                ? "email"
                : field.type === "NUMBER"
                ? "number"
                : "text"
            }
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={placeholder}
            required={field.required}
            className={INPUT_CLASSES}
          />
        )}

        {field.type === "TEXTAREA" && (
          <Textarea
            id={field.name}
            name={field.name}
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={placeholder}
            required={field.required}
            rows={3}
            className={`${INPUT_CLASSES} h-auto min-h-[88px] py-2.5`}
          />
        )}

        {field.type === "SELECT" && (() => {
          const parsed = parseFormFieldOptions(field.options);
          const otherSelected = (value as string) === OTHER_VALUE;
          return (
            <>
              <Select
                value={value as string}
                onValueChange={(v) => {
                  handleFieldChange(field.name, v);
                  if (v !== OTHER_VALUE) {
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
                  }
                }}
                required={field.required}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASSES}>
                  <SelectValue placeholder={placeholder || "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {parsed.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {getOptionLabel(option)}
                    </SelectItem>
                  ))}
                  {parsed.other && (
                    <SelectItem value={OTHER_VALUE}>
                      {resolveOtherLabel(parsed.other, lang)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {parsed.other && otherSelected && (
                <OtherTextInput
                  fieldName={field.name}
                  value={
                    (formValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
                  }
                  onChange={(v) =>
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, v)
                  }
                  label={t.pleaseSpecify}
                  placeholder={resolveOtherPlaceholder(parsed.other, lang)}
                  required={field.required}
                />
              )}
            </>
          );
        })()}

        {field.type === "COUNTRY" && (
          <Select
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            required={field.required}
          >
            <SelectTrigger className={SELECT_TRIGGER_CLASSES}>
              <SelectValue
                placeholder={
                  placeholder ||
                  (isRtl ? "اختر الدولة..." : "Select country...")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {isRtl ? country.nameAr : country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {field.type === "RADIO" && (() => {
          const parsed = parseFormFieldOptions(field.options);
          const otherSelected = (value as string) === OTHER_VALUE;
          return (
            <>
              <RadioGroup
                value={value as string}
                onValueChange={(v) => {
                  handleFieldChange(field.name, v);
                  if (v !== OTHER_VALUE) {
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
                  }
                }}
                className="flex flex-wrap gap-4"
              >
                {parsed.options.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={option.value}
                      id={`${field.name}-${option.value}`}
                    />
                    <Label
                      htmlFor={`${field.name}-${option.value}`}
                      className="text-sm"
                    >
                      {getOptionLabel(option)}
                    </Label>
                  </div>
                ))}
                {parsed.other && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={OTHER_VALUE}
                      id={`${field.name}-${OTHER_VALUE}`}
                    />
                    <Label
                      htmlFor={`${field.name}-${OTHER_VALUE}`}
                      className="text-sm"
                    >
                      {resolveOtherLabel(parsed.other, lang)}
                    </Label>
                  </div>
                )}
              </RadioGroup>
              {parsed.other && otherSelected && (
                <OtherTextInput
                  fieldName={field.name}
                  value={
                    (formValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
                  }
                  onChange={(v) =>
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, v)
                  }
                  label={t.pleaseSpecify}
                  placeholder={resolveOtherPlaceholder(parsed.other, lang)}
                  required={field.required}
                />
              )}
            </>
          );
        })()}

        {field.type === "CHECKBOX" && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value as boolean}
              onCheckedChange={(checked) =>
                handleFieldChange(field.name, !!checked)
              }
            />
            <Label htmlFor={field.name} className="text-sm">
              {placeholder || label}
            </Label>
          </div>
        )}

        {field.type === "MULTISELECT" && (() => {
          const parsed = parseFormFieldOptions(field.options);
          const arr = Array.isArray(value) ? (value as string[]) : [];
          const max = parsed.maxSelections;
          const atLimit =
            typeof max === "number" && max > 0 && arr.length >= max;
          const showCounter =
            typeof max === "number" && max > 0 && parsed.showSelectionCounter !== false;
          const otherSelected = arr.includes(OTHER_VALUE);

          // Renders one option as a bordered card with a leading radio
          // dot. Selected/disabled visuals are themed off the event's
          // primaryColor (border + low-alpha tint + filled dot) so each
          // event keeps its own brand on this large, prominent control.
          const renderCard = (
            optionValue: string,
            labelText: string
          ) => {
            const selected = arr.includes(optionValue);
            const disabled = !selected && atLimit;
            const handleClick = () => {
              if (disabled) return;
              const next = selected
                ? arr.filter((v) => v !== optionValue)
                : [...arr, optionValue];
              handleFieldChange(field.name, next);
              // Deselecting Other clears the sibling text.
              if (selected && optionValue === OTHER_VALUE) {
                handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
              }
            };
            const card = (
              <button
                type="button"
                key={optionValue}
                aria-pressed={selected}
                aria-disabled={disabled}
                onClick={handleClick}
                className={`flex h-full w-full items-start gap-3 rounded-[11px] border px-3.5 py-3 text-sm transition-colors ${
                  selected
                    ? "font-medium"
                    : disabled
                    ? "border-[#e3e4e8] text-gray-400 cursor-not-allowed opacity-60"
                    : "border-[#e3e4e8] text-gray-700 hover:border-gray-300 hover:bg-gray-50/60 cursor-pointer"
                }`}
                style={
                  selected
                    ? {
                        borderColor: primaryColor,
                        backgroundColor: `${primaryColor}1a`,
                        color: textColor,
                      }
                    : undefined
                }
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: selected ? primaryColor : "#d1d5db",
                  }}
                >
                  {selected && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                  )}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{labelText}</span>
              </button>
            );
            if (!disabled || typeof max !== "number") return card;
            return (
              <Tooltip key={optionValue}>
                <TooltipTrigger asChild>
                  {/* block h-full so the h-full card inside fills the
                      stretched grid cell — keeps at-max cards equal-height. */}
                  <span className="block h-full">{card}</span>
                </TooltipTrigger>
                <TooltipContent>{t.maxReachedTooltip(max)}</TooltipContent>
              </Tooltip>
            );
          };

          return (
            <TooltipProvider delayDuration={150}>
              <div
                className={`grid gap-2 ${
                  OPTION_COLS[field.optionColumns ?? "AUTO"]
                }`}
              >
                {parsed.options.map((option) =>
                  renderCard(option.value, getOptionLabel(option))
                )}
                {parsed.other &&
                  renderCard(
                    OTHER_VALUE,
                    resolveOtherLabel(parsed.other, lang)
                  )}
              </div>

              {showCounter && (
                <p
                  className={`mt-2 text-xs ${
                    atLimit ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {atLimit
                    ? t.counterAtLimit(max!)
                    : t.counterBelow(arr.length, max!)}
                </p>
              )}

              {parsed.other && otherSelected && (
                <OtherTextInput
                  fieldName={field.name}
                  value={
                    (formValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
                  }
                  onChange={(v) =>
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, v)
                  }
                  label={t.pleaseSpecify}
                  placeholder={resolveOtherPlaceholder(parsed.other, lang)}
                  required={field.required}
                />
              )}
            </TooltipProvider>
          );
        })()}

        {field.type === "DATE" && (
          <Input
            id={field.name}
            name={field.name}
            type="date"
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            className={INPUT_CLASSES}
          />
        )}
        {field.type === "TIME" && (
          <Input
            id={field.name}
            name={field.name}
            type="time"
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            className={INPUT_CLASSES}
          />
        )}
        {field.type === "DATETIME" && (
          <Input
            id={field.name}
            name={field.name}
            type="datetime-local"
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            className={INPUT_CLASSES}
          />
        )}

        {field.type === "FILE" && (
          <FileUploadControl
            eventSlug={eventSlug}
            formFieldId={field.id}
            metadata={parseFileFieldMetadata(field.metadata)}
            required={field.required}
            lang={lang}
            value={
              value && typeof value === "object" && !Array.isArray(value)
                ? (value as UploadedFileRef)
                : null
            }
            onChange={(next) => handleFieldChange(field.name, next)}
          />
        )}

        {/* Help text — rendered below the input for any non-layout field
            type. Suppressed when the field has no help text in the active
            language (so the wrapper doesn't leave an orphan gap). */}
        {getFieldHelpText(field) && (
          <p className="text-sm text-muted-foreground">
            {getFieldHelpText(field)}
          </p>
        )}
      </div>
    );
}
