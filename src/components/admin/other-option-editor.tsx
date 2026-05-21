"use client";

/**
 * <OtherOptionEditor>
 *
 * Toggle + two BilingualInput pairs that configure the "Other (please
 * specify)" choice on SELECT / RADIO / MULTISELECT fields.
 *
 * When the toggle is off we pass `undefined` upward (no Other feature).
 * When it's on we pass an OtherConfig with only the customized fields
 * filled in — empty inputs are NOT persisted so the on-disk defaults can
 * evolve later without touching old rows.
 */

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BilingualInput } from "@/components/admin/bilingual-input";
import {
  OTHER_DEFAULTS,
  type OtherConfig,
} from "@/lib/form-builder/options-parse";

export interface OtherOptionEditorProps {
  value: OtherConfig | undefined;
  onChange: (next: OtherConfig | undefined) => void;
}

export function OtherOptionEditor({ value, onChange }: OtherOptionEditorProps) {
  const enabled = !!value;

  const toggle = (next: boolean) => {
    if (next) {
      onChange({ enabled: true });
    } else {
      onChange(undefined);
    }
  };

  const patch = (changes: Partial<OtherConfig>) => {
    if (!enabled) return;
    const merged: OtherConfig = { ...value, ...changes, enabled: true };
    // Strip blank strings so OtherConfig only carries admin-customized text;
    // defaults are resolved at render-time.
    for (const key of ["label", "labelAr", "placeholder", "placeholderAr"] as const) {
      const v = merged[key];
      if (typeof v === "string" && v.trim() === "") {
        delete merged[key];
      }
    }
    onChange(merged);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <Switch
          id="other-toggle"
          checked={enabled}
          onCheckedChange={toggle}
        />
        <div className="flex-1 space-y-0.5">
          <Label htmlFor="other-toggle" className="text-sm font-medium">
            Allow &ldquo;Other&rdquo; with custom text
          </Label>
          <p className="text-xs text-muted-foreground">
            Visitors can pick &ldquo;Other&rdquo; and type a custom answer. Leave
            the fields below blank to use defaults.
          </p>
        </div>
      </div>

      {enabled && (
        <div className="space-y-3 pt-1">
          <div>
            <BilingualInput
              label="Choice label"
              valueEn={value?.label ?? ""}
              valueAr={value?.labelAr ?? ""}
              onChangeEn={(v) => patch({ label: v })}
              onChangeAr={(v) => patch({ labelAr: v })}
              placeholderEn={OTHER_DEFAULTS.label}
              placeholderAr={OTHER_DEFAULTS.labelAr}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown at the bottom of the choice list.
            </p>
          </div>

          <div>
            <BilingualInput
              label="Custom text placeholder"
              valueEn={value?.placeholder ?? ""}
              valueAr={value?.placeholderAr ?? ""}
              onChangeEn={(v) => patch({ placeholder: v })}
              onChangeAr={(v) => patch({ placeholderAr: v })}
              placeholderEn={OTHER_DEFAULTS.placeholder}
              placeholderAr={OTHER_DEFAULTS.placeholderAr}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Hint shown inside the text input that appears when Other is
              selected.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
