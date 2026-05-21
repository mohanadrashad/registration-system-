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
import { COUNTRIES } from "@/lib/form-builder/countries";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  resolveOtherPlaceholder,
  OTHER_VALUE,
} from "@/lib/form-builder/options-parse";
import type { FormFieldDef } from "./field-display";

/**
 * Edit input for a single form field. Behaviour is a 1:1 port of the
 * original page's `renderEditInput` — same input types, same value
 * coercion — just lifted into a reusable component so the Identity and
 * Registration-answers cards can both use it.
 *
 * When a SELECT/RADIO/MULTISELECT field has the "Other" feature enabled
 * and __other is selected, an extra text input renders below. Callers
 * provide `otherText` + `onChangeOtherText` to wire the sibling key.
 * If those props are omitted the text input is read-only (admin still
 * sees the synthetic Other label, just can't edit the typed text).
 */
export function FieldEditInput({
  field,
  value,
  onChange,
  otherText,
  onChangeOtherText,
}: {
  field: FormFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  otherText?: string;
  onChangeOtherText?: (v: string) => void;
}) {
  const parsed = parseFormFieldOptions(field.options);
  const otherEnabled = !!parsed.other;
  const otherSelected =
    (typeof value === "string" && value === OTHER_VALUE) ||
    (Array.isArray(value) && (value as string[]).includes(OTHER_VALUE));
  const otherTextInput =
    otherEnabled && otherSelected ? (
      <Input
        className="mt-2"
        value={otherText ?? ""}
        onChange={(e) => onChangeOtherText?.(e.target.value)}
        placeholder={resolveOtherPlaceholder(parsed.other, "en")}
        readOnly={!onChangeOtherText}
      />
    ) : null;
  if (["TEXT", "EMAIL", "PHONE", "NUMBER", "PHONE_COUNTRY"].includes(field.type)) {
    return (
      <Input
        type={field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : "text"}
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === "TEXTAREA") {
    return (
      <Textarea
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }
  if (field.type === "SELECT") {
    return (
      <>
        <Select
          value={(value as string) || ""}
          onValueChange={(v) => {
            onChange(v);
            if (v !== OTHER_VALUE) onChangeOtherText?.("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {parsed.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            {parsed.other && (
              <SelectItem value={OTHER_VALUE}>
                {resolveOtherLabel(parsed.other, "en")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {otherTextInput}
      </>
    );
  }
  if (field.type === "COUNTRY") {
    return (
      <Select value={(value as string) || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select country..." />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "RADIO") {
    return (
      <>
        <RadioGroup
          value={(value as string) || ""}
          onValueChange={(v) => {
            onChange(v);
            if (v !== OTHER_VALUE) onChangeOtherText?.("");
          }}
          className="flex flex-wrap gap-4"
        >
          {parsed.options.map((o) => (
            <div key={o.value} className="flex items-center space-x-2">
              <RadioGroupItem value={o.value} id={`${field.name}-${o.value}`} />
              <Label htmlFor={`${field.name}-${o.value}`} className="text-sm">
                {o.label}
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
                {resolveOtherLabel(parsed.other, "en")}
              </Label>
            </div>
          )}
        </RadioGroup>
        {otherTextInput}
      </>
    );
  }
  if (field.type === "CHECKBOX") {
    return (
      <div className="flex items-center space-x-2">
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(c) => onChange(Boolean(c))}
          id={field.name}
        />
        <Label htmlFor={field.name} className="text-sm">
          {field.label}
        </Label>
      </div>
    );
  }
  if (field.type === "MULTISELECT") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const max = parsed.maxSelections;
    const atLimit = typeof max === "number" && max > 0 && arr.length >= max;

    const renderRow = (
      optValue: string,
      labelText: string,
      isOther: boolean
    ) => {
      const checked = arr.includes(optValue);
      const disabled = !checked && atLimit;
      return (
        <div
          key={optValue}
          className={`flex items-center space-x-2 ${
            disabled ? "opacity-60" : ""
          }`}
        >
          <Checkbox
            checked={checked}
            disabled={disabled}
            onCheckedChange={(c) => {
              const next = c
                ? [...arr, optValue]
                : arr.filter((v) => v !== optValue);
              onChange(next);
              if (!c && isOther) onChangeOtherText?.("");
            }}
            id={`${field.name}-${optValue}`}
          />
          <Label htmlFor={`${field.name}-${optValue}`} className="text-sm">
            {labelText}
          </Label>
        </div>
      );
    };

    return (
      <div className="space-y-1">
        {parsed.options.map((o) => renderRow(o.value, o.label, false))}
        {parsed.other &&
          renderRow(OTHER_VALUE, resolveOtherLabel(parsed.other, "en"), true)}
        {otherTextInput}
      </div>
    );
  }
  if (["DATE", "TIME", "DATETIME"].includes(field.type)) {
    return (
      <Input
        type={field.type === "DATE" ? "date" : field.type === "TIME" ? "time" : "datetime-local"}
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />
  );
}
