"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Section-label color picker, shown in the Add/Edit dialogs only for HEADING
// fields. value "" = the default muted gray; a hex sets FormField.metadata.color.
export function HeadingColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
      <Label className="text-sm font-medium">Section label color</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label="Section label color"
          value={value || "#6b7280"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1"
        />
        <span className="text-sm text-muted-foreground">
          {value || "Default (muted gray)"}
        </span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onChange("")}
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
