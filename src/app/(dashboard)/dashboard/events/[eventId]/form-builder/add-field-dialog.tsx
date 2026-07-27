"use client";

import { Plus } from "lucide-react";
import type { FieldType, FieldWidth, OptionColumns } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { OptionsEditor } from "@/components/admin/options-editor";
import { OtherOptionEditor } from "@/components/admin/other-option-editor";
import { MaxSelectionsEditor } from "@/components/admin/max-selections-editor";
import { FieldTextFields } from "@/components/admin/field-text-fields";
import { FileFieldSettings } from "@/components/admin/file-field-settings";
import { ConditionalEditor } from "./conditional-editor";
import { HeadingColorField } from "./heading-color-field";
import { OPTION_FIELD_TYPES, FIELD_ICONS, FIELD_TYPE_LABELS } from "./field-meta";
import type { FormField, NewFieldDraft } from "./types";

// "Add Field" trigger button + dialog. The page owns the draft state (its
// "Add section heading" header button also writes to it) and the submit.
export function AddFieldDialog({
  open,
  onOpenChange,
  selectedStepId,
  selectedStepTitle,
  newField,
  onChange,
  onSubmit,
  allFieldsOnEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStepId: string;
  selectedStepTitle: string | undefined;
  newField: NewFieldDraft;
  onChange: (next: NewFieldDraft) => void;
  onSubmit: () => void;
  allFieldsOnEvent: FormField[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={!selectedStepId}>
          <Plus className="mr-2 h-4 w-4" />
          Add Field
        </Button>
      </DialogTrigger>
      {/* Cap height + sticky footer — keeps Add/Save reachable even when
          the body contains 20+ expanded option rows. See bulk-paste-dialog
          for the same pattern. */}
      <DialogContent className="flex flex-col gap-0 p-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>
            Add Field to &ldquo;{selectedStepTitle ?? "step"}&rdquo;
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-6 py-4">
          <div className="space-y-2">
            <Label>Field Name (internal)</Label>
            <Input
              value={newField.name}
              onChange={(e) =>
                onChange({
                  ...newField,
                  name: e.target.value.replace(/\s/g, "_").toLowerCase(),
                })
              }
              placeholder="field_name"
            />
          </div>
          <FieldTextFields
            fieldType={newField.type}
            label={newField.label}
            labelAr={newField.labelAr}
            placeholder={newField.placeholder}
            placeholderAr={newField.placeholderAr}
            helpText={newField.helpText}
            helpTextAr={newField.helpTextAr}
            onChange={(patch) => onChange({ ...newField, ...patch })}
          />
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={newField.type}
              onValueChange={(v) =>
                onChange({ ...newField, type: v as FieldType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      {FIELD_ICONS[type as FieldType]}
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Width</Label>
            <Select
              value={newField.width}
              onValueChange={(v) =>
                onChange({ ...newField, width: v as FieldWidth })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL">Full Width</SelectItem>
                <SelectItem value="HALF">Half Width</SelectItem>
                <SelectItem value="THIRD">One Third</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newField.type === "MULTISELECT" && (
            <div className="space-y-2">
              <Label>Option Columns</Label>
              <Select
                value={newField.optionColumns}
                onValueChange={(v) =>
                  onChange({
                    ...newField,
                    optionColumns: v as OptionColumns,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">
                    Auto (1 on mobile, 2 on desktop)
                  </SelectItem>
                  <SelectItem value="ONE">1 column</SelectItem>
                  <SelectItem value="TWO">2 columns (incl. mobile)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Layout of the option cards on the registration page.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={newField.required}
              onCheckedChange={(c) =>
                onChange({ ...newField, required: c })
              }
            />
            <Label>Required</Label>
          </div>

          <ConditionalEditor
            value={newField.conditional}
            onChange={(c) =>
              onChange({ ...newField, conditional: c })
            }
            candidateFields={allFieldsOnEvent}
          />

          {newField.type === "FILE" && (
            <FileFieldSettings
              value={newField.fileMetadata}
              onChange={(next) =>
                onChange({ ...newField, fileMetadata: next })
              }
            />
          )}

          {newField.type === "HEADING" && (
            <HeadingColorField
              value={newField.headingColor}
              onChange={(v) => onChange({ ...newField, headingColor: v })}
            />
          )}

          {OPTION_FIELD_TYPES.includes(newField.type) && (
            <>
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <Label className="text-sm font-medium">Options</Label>
                <OptionsEditor
                  options={newField.options}
                  onChange={(opts) =>
                    onChange({ ...newField, options: opts })
                  }
                />
              </div>

              <OtherOptionEditor
                value={newField.other}
                onChange={(other) => onChange({ ...newField, other })}
              />

              {newField.type === "MULTISELECT" && (
                <MaxSelectionsEditor
                  maxSelections={newField.maxSelections}
                  showCounter={newField.showSelectionCounter}
                  optionCount={newField.options.length}
                  hasOther={!!newField.other}
                  onChange={({ maxSelections, showCounter }) =>
                    onChange({
                      ...newField,
                      maxSelections,
                      showSelectionCounter: showCounter,
                    })
                  }
                />
              )}
            </>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button onClick={onSubmit} className="w-full sm:w-auto">
            Add Field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
