"use client";

/**
 * <MaxSelectionsEditor>
 *
 * Number input + counter toggle. Renders inside the FormField Add/Edit
 * dialog when the field type is MULTISELECT. Hidden for other types.
 *
 * Emits the wrapped pair `{ maxSelections, showSelectionCounter }` on
 * every change. Empty / 0 / blank means "no limit"; the parent serializer
 * drops both keys in that case.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface MaxSelectionsEditorProps {
  maxSelections: number | undefined;
  showCounter: boolean | undefined;
  /** Live count of options on the field; used to render the
   *  "maximum exceeds option count" hint. */
  optionCount: number;
  hasOther: boolean;
  onChange: (next: {
    maxSelections: number | undefined;
    showCounter: boolean | undefined;
  }) => void;
}

export function MaxSelectionsEditor({
  maxSelections,
  showCounter,
  optionCount,
  hasOther,
  onChange,
}: MaxSelectionsEditorProps) {
  const limitActive = typeof maxSelections === "number" && maxSelections > 0;
  // Default to "show counter" when a limit is set; persist explicit false.
  const counterChecked =
    limitActive && showCounter !== false;

  const handleNumber = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange({ maxSelections: undefined, showCounter: undefined });
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n <= 0) {
      onChange({ maxSelections: undefined, showCounter: undefined });
      return;
    }
    onChange({
      maxSelections: n,
      showCounter: showCounter ?? true,
    });
  };

  const handleCounter = (next: boolean) => {
    if (!limitActive) return;
    onChange({ maxSelections, showCounter: next });
  };

  // "Other counts as one selection" hint only when both features are on.
  const showOtherHint = hasOther && limitActive;

  // Warn if the limit exceeds the current option count.
  const overOptionCount =
    limitActive && optionCount > 0 && (maxSelections as number) > optionCount;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <Label className="text-sm font-medium">Maximum selections</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Limit how many options visitors can pick.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={limitActive ? String(maxSelections) : ""}
          onChange={(e) => handleNumber(e.target.value)}
          placeholder="0"
          className="w-24"
        />
        <span className="text-xs text-muted-foreground">
          Leave blank or 0 for no limit.
        </span>
      </div>

      <div className="flex items-start gap-3 pt-1">
        <Switch
          id="counter-toggle"
          checked={counterChecked}
          onCheckedChange={handleCounter}
          disabled={!limitActive}
        />
        <div className="flex-1 space-y-0.5">
          <Label htmlFor="counter-toggle" className="text-sm font-medium">
            Show selection counter on the form
          </Label>
          <p className="text-xs text-muted-foreground">
            Visitors see &ldquo;2 of {limitActive ? maxSelections : "N"}{" "}
            selected&rdquo; below the field.
          </p>
        </div>
      </div>

      {showOtherHint && (
        <p className="text-xs text-muted-foreground">
          ⓘ &ldquo;Other&rdquo; counts as one selection toward the limit.
        </p>
      )}

      {overOptionCount && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          ⚠ Maximum ({maxSelections}) exceeds option count ({optionCount}).
          The effective limit is {optionCount}.
        </p>
      )}
    </div>
  );
}
