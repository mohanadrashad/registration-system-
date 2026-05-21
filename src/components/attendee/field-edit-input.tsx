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
  if (field.type === "FILE") {
    // Read-only in v1. Admin replace + remove on FILE fields are
    // explicit non-goals per the spec — admins can View only. We
    // deliberately do NOT render an editable <input> here because the
    // formData[fieldName] value is a `{ fileId, filename, ... }`
    // object: an editable input would coerce it to "[object Object]"
    // and a stray keystroke would silently clobber the file ref in
    // editValues. The label form preserves the original
    // UploadedFileRef in state untouched while still surfacing the
    // file to the admin.
    //
    // Layout mirrors the Stage 3 spec preview (filename + size + mime)
    // minus the View / Replace / Remove buttons — those land with the
    // stream-through route in Stage 3.
    const file =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { filename?: unknown }).filename === "string"
        ? (value as {
            filename: string;
            mimeType?: string;
            sizeBytes?: number;
          })
        : null;
    const formatSize = (n: number): string => {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    };
    const mimeLabel = (mime: string | undefined): string => {
      if (!mime) return "";
      if (mime === "application/pdf") return "PDF";
      if (mime === "image/jpeg") return "JPEG";
      if (mime === "image/png") return "PNG";
      return mime;
    };
    return (
      <div className="space-y-1">
        {file ? (
          <p className="text-sm">
            <span aria-hidden="true">📄</span>{" "}
            <span className="font-medium break-words">{file.filename}</span>
            {typeof file.sizeBytes === "number" && (
              <span className="text-muted-foreground">
                {" · "}
                {formatSize(file.sizeBytes)}
              </span>
            )}
            {file.mimeType && (
              <span className="text-muted-foreground">
                {" · "}
                {mimeLabel(file.mimeType)}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No file uploaded
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Visitor-uploaded — admin replace/remove arrives in v2.
        </p>
      </div>
    );
  }
  return (
    <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />
  );
}
