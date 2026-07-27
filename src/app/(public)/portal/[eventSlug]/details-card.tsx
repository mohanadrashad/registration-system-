"use client";

import type { Dispatch, SetStateAction } from "react";
import { Edit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/form-builder/countries";
import { pickText, type PortalLang } from "@/lib/portal/i18n";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  resolveOtherPlaceholder,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import { formatFieldValue } from "./format-field-value";
import { getFieldValue, type ContactInfo, type FormFieldDef } from "./types";
import type { PortalT } from "./portal-strings";

// "Your Details" card — read-only display of the attendee's registration
// answers, with an inline edit mode driven by the event's form fields.
// The page owns editing/editValues/saving state and the save handler.
export function DetailsCard({
  visibleFields,
  contact,
  registrationStatus,
  lang,
  t,
  editing,
  editValues,
  setEditValues,
  saving,
  saveError,
  onStartEditing,
  onSave,
  onCancelEditing,
}: {
  visibleFields: FormFieldDef[];
  contact: ContactInfo | null;
  registrationStatus: string | undefined;
  lang: PortalLang;
  t: PortalT;
  editing: boolean;
  editValues: Record<string, unknown>;
  setEditValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  saving: boolean;
  saveError: string;
  onStartEditing: () => void;
  onSave: () => void;
  onCancelEditing: () => void;
}) {
  // Bilingual field helpers — same shape as the phase fill page.
  function fieldLabel(f: FormFieldDef): string {
    return pickText(lang, f.label, f.labelAr);
  }
  function fieldOptionLabel(o: {
    label: string;
    labelAr?: string | null;
  }): string {
    return pickText(lang, o.label, o.labelAr);
  }

  function renderEditInput(field: FormFieldDef) {
    const value = editValues[field.name];
    const setValue = (v: unknown) => setEditValues((prev) => ({ ...prev, [field.name]: v }));

    if (["TEXT", "EMAIL", "PHONE", "NUMBER", "PHONE_COUNTRY"].includes(field.type)) {
      return (
        <Input
          type={field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : "text"}
          value={(value as string) || ""}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    if (field.type === "TEXTAREA") {
      return (
        <Textarea
          value={(value as string) || ""}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
        />
      );
    }
    if (field.type === "SELECT") {
      const parsed = parseFormFieldOptions(field.options);
      const otherSelected = (value as string) === OTHER_VALUE;
      return (
        <>
          <Select
            value={(value as string) || ""}
            onValueChange={(v) => {
              setValue(v);
              if (v !== OTHER_VALUE) {
                setEditValues((prev) => ({
                  ...prev,
                  [`${field.name}${OTHER_SUFFIX}`]: "",
                }));
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t.selectPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {parsed.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {fieldOptionLabel(o)}
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
            <Input
              className="mt-2"
              value={
                (editValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
              }
              onChange={(e) =>
                setEditValues((prev) => ({
                  ...prev,
                  [`${field.name}${OTHER_SUFFIX}`]: e.target.value,
                }))
              }
              placeholder={resolveOtherPlaceholder(parsed.other, lang)}
            />
          )}
        </>
      );
    }
    if (field.type === "COUNTRY") {
      return (
        <Select value={(value as string) || ""} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder={t.selectCountryPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {lang === "ar" ? c.nameAr : c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === "RADIO") {
      const parsed = parseFormFieldOptions(field.options);
      const otherSelected = (value as string) === OTHER_VALUE;
      return (
        <>
          <RadioGroup
            value={(value as string) || ""}
            onValueChange={(v) => {
              setValue(v);
              if (v !== OTHER_VALUE) {
                setEditValues((prev) => ({
                  ...prev,
                  [`${field.name}${OTHER_SUFFIX}`]: "",
                }));
              }
            }}
            className="flex flex-wrap gap-4"
          >
            {parsed.options.map((o) => (
              <div key={o.value} className="flex items-center space-x-2">
                <RadioGroupItem value={o.value} id={`${field.name}-${o.value}`} />
                <Label
                  htmlFor={`${field.name}-${o.value}`}
                  className="text-sm"
                >
                  {fieldOptionLabel(o)}
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
            <Input
              className="mt-2"
              value={
                (editValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
              }
              onChange={(e) =>
                setEditValues((prev) => ({
                  ...prev,
                  [`${field.name}${OTHER_SUFFIX}`]: e.target.value,
                }))
              }
              placeholder={resolveOtherPlaceholder(parsed.other, lang)}
            />
          )}
        </>
      );
    }
    if (field.type === "CHECKBOX") {
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={field.name}
            checked={Boolean(value)}
            onCheckedChange={(c) => setValue(Boolean(c))}
          />
          <Label htmlFor={field.name} className="text-sm">
            {fieldLabel(field)}
          </Label>
        </div>
      );
    }
    if (field.type === "MULTISELECT") {
      const parsed = parseFormFieldOptions(field.options);
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const max = parsed.maxSelections;
      const atLimit = typeof max === "number" && max > 0 && arr.length >= max;
      const otherSelected = arr.includes(OTHER_VALUE);

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
              id={`${field.name}-${optValue}`}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(c) => {
                const next = c
                  ? [...arr, optValue]
                  : arr.filter((v) => v !== optValue);
                setValue(next);
                if (!c && isOther) {
                  setEditValues((prev) => ({
                    ...prev,
                    [`${field.name}${OTHER_SUFFIX}`]: "",
                  }));
                }
              }}
            />
            <Label
              htmlFor={`${field.name}-${optValue}`}
              className="text-sm"
            >
              {labelText}
            </Label>
          </div>
        );
      };

      return (
        <div className="space-y-1">
          {parsed.options.map((o) =>
            renderRow(o.value, fieldOptionLabel(o), false)
          )}
          {parsed.other &&
            renderRow(
              OTHER_VALUE,
              resolveOtherLabel(parsed.other, lang),
              true
            )}
          {parsed.other && otherSelected && (
            <Input
              className="mt-2"
              value={
                (editValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
              }
              onChange={(e) =>
                setEditValues((prev) => ({
                  ...prev,
                  [`${field.name}${OTHER_SUFFIX}`]: e.target.value,
                }))
              }
              placeholder={resolveOtherPlaceholder(parsed.other, lang)}
            />
          )}
        </div>
      );
    }
    if (["DATE", "TIME", "DATETIME"].includes(field.type)) {
      return (
        <Input
          type={field.type === "DATE" ? "date" : field.type === "TIME" ? "time" : "datetime-local"}
          value={(value as string) || ""}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    return (
      <Input
        value={(value as string) || ""}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t.yourDetails}</CardTitle>
          {!editing && registrationStatus !== "CANCELLED" && visibleFields.length > 0 && (
            <Button variant="outline" size="sm" onClick={onStartEditing}>
              <Edit className="h-4 w-4 mr-2" />
              {t.edit}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {visibleFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noDetails}</p>
        ) : editing && contact ? (
          <div className="space-y-4">
            {saveError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {saveError}
              </div>
            )}
            {visibleFields.map((field) => {
              if (field.name === "email") {
                return (
                  <div key={field.name}>
                    <Label className="text-xs text-muted-foreground">{fieldLabel(field)}</Label>
                    <p className="font-medium">{contact.email}</p>
                  </div>
                );
              }
              return (
                <div key={field.name} className="space-y-1.5">
                  {field.type !== "CHECKBOX" && (
                    <Label>
                      {fieldLabel(field)}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                  )}
                  {renderEditInput(field)}
                </div>
              );
            })}
            <div className="flex gap-2 pt-2">
              <Button onClick={onSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.saveChanges}
              </Button>
              <Button variant="outline" onClick={onCancelEditing}>
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : contact ? (
          <div className="space-y-3">
            {visibleFields.map((field) => (
              <div key={field.name} className="flex items-start gap-3 text-sm">
                <span className="text-muted-foreground w-32 shrink-0">
                  {fieldLabel(field)}
                </span>
                <span className="font-medium break-words">
                  {formatFieldValue(
                    field,
                    getFieldValue(contact, field),
                    lang,
                    contact.metadata
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
