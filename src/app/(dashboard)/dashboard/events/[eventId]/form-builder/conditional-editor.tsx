"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConditionalRule, FormField } from "./types";

// "Show this field only if…" editor, shared by the Add and Edit dialogs.
export function ConditionalEditor({
  value,
  onChange,
  candidateFields,
}: {
  value: ConditionalRule | null | undefined;
  onChange: (next: ConditionalRule | null) => void;
  candidateFields: FormField[];
}) {
  const enabled = !!value?.showIf?.field;
  const target = candidateFields.find((f) => f.name === value?.showIf?.field);

  function toggle(on: boolean) {
    if (on) {
      const first = candidateFields[0];
      if (!first) {
        // No other fields exist to depend on yet; do nothing.
        return;
      }
      onChange({
        showIf: {
          field: first.name,
          operator: "equals",
          value: first.type === "CHECKBOX" ? true : "",
        },
      });
    } else {
      onChange(null);
    }
  }

  function patch(next: Partial<ConditionalRule["showIf"]>) {
    if (!value?.showIf) return;
    onChange({ showIf: { ...value.showIf, ...next } });
  }

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={toggle} />
        <Label className="text-sm font-medium">
          Show this field only if…
        </Label>
      </div>
      {enabled && value?.showIf && (
        <div className="space-y-2 pl-2">
          {candidateFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              You need at least one other field on the event to use a
              condition.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Depends on field
                  </Label>
                  <Select
                    value={value.showIf.field}
                    onValueChange={(v) => {
                      const next = candidateFields.find((f) => f.name === v);
                      patch({
                        field: v,
                        // Reset value when field type changes so we don't
                        // leave stale strings on a checkbox dependency.
                        value: next?.type === "CHECKBOX" ? true : "",
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {candidateFields.map((f) => (
                        <SelectItem key={f.id} value={f.name}>
                          {f.label}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({f.name})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Operator
                  </Label>
                  <Select
                    value={value.showIf.operator}
                    onValueChange={(v) =>
                      patch({
                        operator: v as "equals" | "notEquals" | "contains",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">equals</SelectItem>
                      <SelectItem value="notEquals">does not equal</SelectItem>
                      <SelectItem value="contains">contains</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Value</Label>
                {target?.type === "CHECKBOX" ? (
                  <Select
                    value={String(value.showIf.value)}
                    onValueChange={(v) => patch({ value: v === "true" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">checked</SelectItem>
                      <SelectItem value="false">unchecked</SelectItem>
                    </SelectContent>
                  </Select>
                ) : target?.options && target.options.length > 0 ? (
                  <Select
                    value={String(value.showIf.value)}
                    onValueChange={(v) => patch({ value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select expected value…" />
                    </SelectTrigger>
                    <SelectContent>
                      {target.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={String(value.showIf.value ?? "")}
                    onChange={(e) => patch({ value: e.target.value })}
                    placeholder="Expected value"
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
