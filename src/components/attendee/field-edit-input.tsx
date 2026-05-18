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
import type { FormFieldDef } from "./field-display";

/**
 * Edit input for a single form field. Behaviour is a 1:1 port of the
 * original page's `renderEditInput` — same input types, same value
 * coercion — just lifted into a reusable component so the Identity and
 * Registration-answers cards can both use it.
 */
export function FieldEditInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
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
      <Select value={(value as string) || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {(field.options || []).map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      <RadioGroup
        value={(value as string) || ""}
        onValueChange={onChange}
        className="flex flex-wrap gap-4"
      >
        {(field.options || []).map((o) => (
          <div key={o.value} className="flex items-center space-x-2">
            <RadioGroupItem value={o.value} id={`${field.name}-${o.value}`} />
            <Label htmlFor={`${field.name}-${o.value}`} className="text-sm">
              {o.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
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
    return (
      <div className="space-y-1">
        {(field.options || []).map((o) => {
          const checked = arr.includes(o.value);
          return (
            <div key={o.value} className="flex items-center space-x-2">
              <Checkbox
                checked={checked}
                onCheckedChange={(c) => {
                  const next = c ? [...arr, o.value] : arr.filter((v) => v !== o.value);
                  onChange(next);
                }}
                id={`${field.name}-${o.value}`}
              />
              <Label htmlFor={`${field.name}-${o.value}`} className="text-sm">
                {o.label}
              </Label>
            </div>
          );
        })}
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
