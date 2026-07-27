"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SectionHeading } from "@/components/public/section-heading";
import { parseHeadingColor } from "@/lib/form-builder/heading-meta";
import { COUNTRIES } from "@/lib/form-builder/countries";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  resolveOtherPlaceholder,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import { pickText, type PortalLang } from "@/lib/portal/i18n";
import type { FormField, FormValueMap } from "./types";
import type { PageT } from "./page-strings";

interface PortalOtherTextInputProps {
  fieldName: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  required: boolean;
}

function PortalOtherTextInput({
  fieldName,
  value,
  onChange,
  label,
  placeholder,
  required,
}: PortalOtherTextInputProps) {
  return (
    <div className="mt-2 space-y-1">
      <Label
        htmlFor={`${fieldName}${OTHER_SUFFIX}`}
        className="text-xs font-medium text-muted-foreground"
      >
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={`${fieldName}${OTHER_SUFFIX}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// One form field on the phase fill page, rendered per its FieldType —
// including the "Other" free-text sibling, MULTISELECT pills with the
// max-selections counter/tooltip, and the HEADING/DIVIDER/PARAGRAPH
// layout types.
export function PhaseField({
  field,
  formValues,
  onFieldChange,
  readOnly,
  lang,
  t,
}: {
  field: FormField;
  formValues: FormValueMap;
  onFieldChange: (name: string, value: string | boolean | string[]) => void;
  readOnly: boolean;
  lang: PortalLang;
  t: PageT;
}) {
  // Bilingual field helpers — pick Arabic variant when available, fall
  // back to English.
  function fieldLabel(field: FormField): string {
    return pickText(lang, field.label, field.labelAr);
  }
  function fieldPlaceholder(field: FormField): string {
    return pickText(lang, field.placeholder, field.placeholderAr);
  }
  function fieldHelpText(field: FormField): string {
    return pickText(lang, field.helpText, field.helpTextAr);
  }
  function fieldOptionLabel(o: {
    label: string;
    labelAr?: string | null;
  }): string {
    return pickText(lang, o.label, o.labelAr ?? undefined);
  }

  const handleFieldChange = onFieldChange;
  const label = fieldLabel(field);
  const placeholder = fieldPlaceholder(field);
  const helpText = fieldHelpText(field);
  const value = formValues[field.name] ?? "";
  const widthClass =
    field.width === "HALF" || field.width === "THIRD"
      ? "col-span-1"
      : "col-span-2";

  if (["HEADING", "DIVIDER", "PARAGRAPH"].includes(field.type)) {
    if (field.type === "HEADING") {
      return (
        <SectionHeading
          key={field.id}
          label={label}
          color={parseHeadingColor(field.metadata)}
          className="col-span-2 mt-6 first:mt-0"
        />
      );
    }
    if (field.type === "DIVIDER") {
      return (
        <hr key={field.id} className="col-span-2 my-4 border-gray-200" />
      );
    }
    return (
      <p key={field.id} className="col-span-2 text-sm text-gray-500">
        {label}
      </p>
    );
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
      <Label htmlFor={field.name} className="text-xs font-medium text-gray-500">
        {label} {field.required && <span className="text-red-400">*</span>}
      </Label>
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
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
          disabled={readOnly}
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
          disabled={readOnly}
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
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    placeholder || (lang === "ar" ? "اختر..." : "Select...")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {parsed.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {fieldOptionLabel(option)}
                  </SelectItem>
                ))}
                {parsed.other && (
                  <SelectItem value={OTHER_VALUE}>
                    {resolveOtherLabel(parsed.other, lang)}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {parsed.other && otherSelected && !readOnly && (
              <PortalOtherTextInput
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
          disabled={readOnly}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                placeholder ||
                (lang === "ar" ? "اختر الدولة..." : "Select country...")
              }
            />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((country) => (
              <SelectItem key={country.code} value={country.code}>
                {lang === "ar" ? country.nameAr : country.name}
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
              disabled={readOnly}
            >
              {parsed.options.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-2"
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`${field.name}-${option.value}`}
                  />
                  <Label
                    htmlFor={`${field.name}-${option.value}`}
                    className="text-sm"
                  >
                    {fieldOptionLabel(option)}
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
            {parsed.other && otherSelected && !readOnly && (
              <PortalOtherTextInput
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
            disabled={readOnly}
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
          typeof max === "number" &&
          max > 0 &&
          parsed.showSelectionCounter !== false;
        const otherSelected = arr.includes(OTHER_VALUE);

        const renderPill = (optionValue: string, labelText: string) => {
          const selected = arr.includes(optionValue);
          const disabled = !selected && atLimit;
          const onClick = () => {
            if (readOnly || disabled) return;
            const next = selected
              ? arr.filter((v) => v !== optionValue)
              : [...arr, optionValue];
            handleFieldChange(field.name, next);
            if (selected && optionValue === OTHER_VALUE) {
              handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
            }
          };
          const btn = (
            <button
              type="button"
              key={optionValue}
              aria-disabled={readOnly || disabled}
              onClick={onClick}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selected
                  ? "border-transparent bg-primary text-primary-foreground"
                  : disabled
                  ? "border-gray-200 bg-gray-50/50 text-gray-400 cursor-not-allowed opacity-60"
                  : "border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {labelText}
            </button>
          );
          if (!disabled || typeof max !== "number") return btn;
          return (
            <Tooltip key={optionValue}>
              <TooltipTrigger asChild>
                <span>{btn}</span>
              </TooltipTrigger>
              <TooltipContent>{t.maxReachedTooltip(max)}</TooltipContent>
            </Tooltip>
          );
        };

        return (
          <TooltipProvider delayDuration={150}>
            <div className="flex flex-wrap gap-2">
              {parsed.options.map((option) =>
                renderPill(option.value, fieldOptionLabel(option))
              )}
              {parsed.other &&
                renderPill(
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
            {parsed.other && otherSelected && !readOnly && (
              <PortalOtherTextInput
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
          disabled={readOnly}
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
          disabled={readOnly}
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
          disabled={readOnly}
        />
      )}
    </div>
  );
}
