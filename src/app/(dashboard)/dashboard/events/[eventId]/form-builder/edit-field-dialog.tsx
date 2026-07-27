"use client";

import type { FieldType, FieldWidth, OptionColumns } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { parseFileFieldMetadata } from "@/lib/validations/file-field-metadata";
import { parseHeadingColor } from "@/lib/form-builder/heading-meta";
import { ConditionalEditor } from "./conditional-editor";
import { HeadingColorField } from "./heading-color-field";
import { OPTION_FIELD_TYPES, FIELD_TYPE_LABELS } from "./field-meta";
import type { FormField } from "./types";

// Edit Field dialog — same height-cap + sticky-footer pattern as Add Field
// so a 20-option field can't push the Save button off-screen. The page owns
// the field-being-edited state (open = field !== null) and the save.
export function EditFieldDialog({
  field,
  onFieldChange,
  onClose,
  onSave,
  allFieldsOnEvent,
  portalEnabled,
}: {
  field: FormField | null;
  onFieldChange: (next: FormField) => void;
  onClose: () => void;
  onSave: (field: FormField) => void;
  allFieldsOnEvent: FormField[];
  portalEnabled: boolean;
}) {
  return (
    <Dialog open={!!field} onOpenChange={() => onClose()}>
      <DialogContent className="flex flex-col gap-0 p-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>Edit Field</DialogTitle>
        </DialogHeader>
        {field && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-6 py-4">
            <div className="space-y-2">
              <Label>Field Name</Label>
              <Input
                value={field.name}
                onChange={(e) =>
                  onFieldChange({ ...field, name: e.target.value })
                }
                disabled={field.isSystem}
              />
            </div>
            <FieldTextFields
              fieldType={field.type}
              label={field.label}
              labelAr={field.labelAr ?? ""}
              placeholder={field.placeholder ?? ""}
              placeholderAr={field.placeholderAr ?? ""}
              helpText={field.helpText ?? ""}
              helpTextAr={field.helpTextAr ?? ""}
              onChange={(patch) =>
                onFieldChange({ ...field, ...patch })
              }
            />
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={field.type}
                onValueChange={(v) =>
                  onFieldChange({ ...field, type: v as FieldType })
                }
                disabled={field.isSystem}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Width</Label>
              <Select
                value={field.width}
                onValueChange={(v) =>
                  onFieldChange({
                    ...field,
                    width: v as FieldWidth,
                  })
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
            {field.type === "MULTISELECT" && (
              <div className="space-y-2">
                <Label>Option Columns</Label>
                <Select
                  value={field.optionColumns}
                  onValueChange={(v) =>
                    onFieldChange({
                      ...field,
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
            {(() => {
              const emailRequiredLocked =
                portalEnabled && field.name === "email";
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={
                        emailRequiredLocked ? true : field.required
                      }
                      disabled={emailRequiredLocked}
                      onCheckedChange={(c) =>
                        onFieldChange({ ...field, required: c })
                      }
                    />
                    <Label>Required</Label>
                  </div>
                  {emailRequiredLocked && (
                    <p className="text-xs text-muted-foreground">
                      Required because the self-service portal is enabled.
                      Disable the portal module to make email optional.
                    </p>
                  )}
                </div>
              );
            })()}

            <ConditionalEditor
              value={field.conditional}
              onChange={(c) =>
                onFieldChange({ ...field, conditional: c })
              }
              candidateFields={allFieldsOnEvent.filter(
                (f) => f.id !== field.id
              )}
            />

            {field.type === "FILE" && (
              <FileFieldSettings
                value={parseFileFieldMetadata(field.metadata)}
                onChange={(next) =>
                  onFieldChange({ ...field, metadata: next })
                }
              />
            )}

            {field.type === "HEADING" && (
              <HeadingColorField
                value={parseHeadingColor(field.metadata) ?? ""}
                onChange={(v) =>
                  onFieldChange({
                    ...field,
                    metadata: v ? { color: v } : null,
                  })
                }
              />
            )}

            {OPTION_FIELD_TYPES.includes(field.type) && (
              <>
                <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                  <Label className="text-sm font-medium">Options</Label>
                  <OptionsEditor
                    options={field.options ?? []}
                    onChange={(opts) =>
                      onFieldChange({ ...field, options: opts })
                    }
                  />
                </div>

                <OtherOptionEditor
                  value={field.other}
                  onChange={(other) =>
                    onFieldChange({ ...field, other })
                  }
                />

                {field.type === "MULTISELECT" && (
                  <MaxSelectionsEditor
                    maxSelections={field.maxSelections}
                    showCounter={field.showSelectionCounter}
                    optionCount={(field.options ?? []).length}
                    hasOther={!!field.other}
                    onChange={({ maxSelections, showCounter }) =>
                      onFieldChange({
                        ...field,
                        maxSelections,
                        showSelectionCounter: showCounter,
                      })
                    }
                  />
                )}
              </>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={field.isActive}
                onCheckedChange={(c) =>
                  onFieldChange({ ...field, isActive: c })
                }
              />
              <Label>Active</Label>
            </div>
          </div>
        )}
        {field && (
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button
              onClick={() => onSave(field)}
              className="w-full sm:w-auto"
            >
              Save Changes
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
