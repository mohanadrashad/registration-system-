"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { BilingualInput } from "@/components/admin/bilingual-input";
import type { PhaseOption } from "./phase-option-types";

// ─── OptionEditor: full edit form — bilingual labels, URL, capacity, ──
// ─── 3-state requiresReceipt, metadata key/value, active toggle. ─────

interface OptionEditorProps {
  option: PhaseOption;
  isPending: boolean;
  phaseRequiresReceipt: boolean;
  multiLanguageEnabled: boolean;
  onPatch: (
    patch: Partial<PhaseOption>,
    optimistic: Partial<PhaseOption>
  ) => Promise<void>;
  onDelete: () => void;
}

export function OptionEditor({
  option,
  isPending,
  phaseRequiresReceipt,
  multiLanguageEnabled,
  onPatch,
  onDelete,
}: OptionEditorProps) {
  const [label, setLabel] = useState(option.label);
  const [labelAr, setLabelAr] = useState(option.labelAr ?? "");
  const [description, setDescription] = useState(option.description ?? "");
  const [descriptionAr, setDescriptionAr] = useState(
    option.descriptionAr ?? ""
  );
  const [externalUrl, setExternalUrl] = useState(option.externalUrl ?? "");
  const [capacity, setCapacity] = useState(
    option.capacity == null ? "" : String(option.capacity)
  );
  // Category-Phases stage 3 — per-option receipt copy drafts.
  const [receiptLabel, setReceiptLabel] = useState(option.receiptLabel ?? "");
  const [receiptInstructions, setReceiptInstructions] = useState(
    option.receiptInstructions ?? ""
  );
  const [receiptLabelAr, setReceiptLabelAr] = useState(
    option.receiptLabelAr ?? ""
  );
  const [receiptInstructionsAr, setReceiptInstructionsAr] = useState(
    option.receiptInstructionsAr ?? ""
  );

  // Re-sync drafts only when the option identity changes (open editor on a
  // different row). We deliberately don't re-sync on every prop change so a
  // mid-typing optimistic update doesn't yank the cursor; the user's drafts
  // remain authoritative until they blur.
  useEffect(() => {
    setLabel(option.label);
    setLabelAr(option.labelAr ?? "");
    setDescription(option.description ?? "");
    setDescriptionAr(option.descriptionAr ?? "");
    setExternalUrl(option.externalUrl ?? "");
    setCapacity(option.capacity == null ? "" : String(option.capacity));
    setReceiptLabel(option.receiptLabel ?? "");
    setReceiptInstructions(option.receiptInstructions ?? "");
    setReceiptLabelAr(option.receiptLabelAr ?? "");
    setReceiptInstructionsAr(option.receiptInstructionsAr ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id]);

  // Metadata UI keeps an ordered array of {key, value} so adding new rows
  // doesn't reorder the others. Translated to a Record<string, string> on
  // commit (later rows with duplicate keys overwrite earlier ones).
  const [metaRows, setMetaRows] = useState<{ key: string; value: string }[]>(
    () =>
      option.metadata
        ? Object.entries(option.metadata).map(([key, value]) => ({
            key,
            value,
          }))
        : []
  );
  useEffect(() => {
    setMetaRows(
      option.metadata
        ? Object.entries(option.metadata).map(([key, value]) => ({
            key,
            value,
          }))
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id]);

  // 3-state requiresReceipt → string for the radio group (which only takes
  // strings). Maps null=inherit, true=always, false=never.
  const requiresReceiptValue = useMemo(() => {
    if (option.requiresReceipt === null) return "inherit";
    return option.requiresReceipt ? "always" : "never";
  }, [option.requiresReceipt]);

  function commitMetadata(rows: { key: string; value: string }[]) {
    const cleaned: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      cleaned[k] = r.value;
    }
    const next = Object.keys(cleaned).length === 0 ? null : cleaned;
    onPatch({ metadata: next }, { metadata: next });
  }

  function commitRequiresReceipt(value: string) {
    let next: boolean | null;
    if (value === "always") next = true;
    else if (value === "never") next = false;
    else next = null;
    onPatch({ requiresReceipt: next }, { requiresReceipt: next });
  }

  function commitCapacity() {
    const trimmed = capacity.trim();
    if (trimmed === "") {
      if (option.capacity !== null)
        onPatch({ capacity: null }, { capacity: null });
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) {
      setCapacity(option.capacity == null ? "" : String(option.capacity));
      return;
    }
    if (n !== option.capacity) onPatch({ capacity: n }, { capacity: n });
  }

  const selectionCount = option._count?.selections ?? 0;

  return (
    <div className="space-y-4 border-t bg-muted/20 p-4">
      <BilingualInput
        label="Label"
        idPrefix={`option-label-${option.id}`}
        valueEn={label}
        valueAr={labelAr}
        onChangeEn={setLabel}
        onChangeAr={setLabelAr}
        onBlurEn={() => {
          const trimmed = label.trim();
          if (trimmed && trimmed !== option.label) {
            onPatch({ label: trimmed }, { label: trimmed });
          } else if (!trimmed) {
            setLabel(option.label);
          }
        }}
        onBlurAr={() => {
          const next = labelAr.trim() || null;
          if (next !== (option.labelAr ?? null)) {
            onPatch({ labelAr: next }, { labelAr: next });
          }
        }}
      />

      <BilingualInput
        label="Description"
        idPrefix={`option-description-${option.id}`}
        multiline
        rows={2}
        valueEn={description}
        valueAr={descriptionAr}
        onChangeEn={setDescription}
        onChangeAr={setDescriptionAr}
        onBlurEn={() => {
          const next = description.trim() || null;
          if (next !== (option.description ?? null)) {
            onPatch({ description: next }, { description: next });
          }
        }}
        onBlurAr={() => {
          const next = descriptionAr.trim() || null;
          if (next !== (option.descriptionAr ?? null)) {
            onPatch({ descriptionAr: next }, { descriptionAr: next });
          }
        }}
      />

      <div className="space-y-2">
        <Label>External link (optional)</Label>
        <Input
          type="url"
          placeholder="https://hotel.com/booking"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          onBlur={() => {
            const next = externalUrl.trim() || null;
            if (next !== (option.externalUrl ?? null)) {
              onPatch({ externalUrl: next }, { externalUrl: next });
            }
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Capacity</Label>
          <Input
            type="number"
            min={0}
            placeholder="Leave empty for unlimited"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            onBlur={commitCapacity}
          />
          <p className="text-xs text-muted-foreground">
            {selectionCount > 0
              ? `${selectionCount} attendee${
                  selectionCount === 1 ? "" : "s"
                } currently assigned to this option.`
              : "No attendees assigned yet."}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Requires receipt</Label>
          <RadioGroup
            value={requiresReceiptValue}
            onValueChange={commitRequiresReceipt}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="inherit"
                id={`receipt-inherit-${option.id}`}
              />
              <Label
                htmlFor={`receipt-inherit-${option.id}`}
                className="font-normal"
              >
                Inherit (phase default:{" "}
                {phaseRequiresReceipt ? "required" : "off"})
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="always"
                id={`receipt-always-${option.id}`}
              />
              <Label
                htmlFor={`receipt-always-${option.id}`}
                className="font-normal"
              >
                Always require for this option
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="never"
                id={`receipt-never-${option.id}`}
              />
              <Label
                htmlFor={`receipt-never-${option.id}`}
                className="font-normal"
              >
                Never require for this option
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      {/* Category-Phases stage 3 — Receipt label & instructions.
          Visibility (Decision A1, "effective requirement"):
            • requiresReceipt === true                                → show
            • requiresReceipt === null AND phase default is true      → show
            • everything else (false, or inherit-off-by-phase)        → hide
          Hidden inputs keep their drafts so a stray toggle off-then-on
          doesn't wipe the user's typing. The AR siblings additionally
          gate on multiLanguageEnabled (Decision B1). */}
      {(option.requiresReceipt === true ||
        (option.requiresReceipt === null && phaseRequiresReceipt)) && (
        <div className="space-y-4 rounded-md border bg-background p-3">
          <div>
            <Label className="font-medium">Receipt context</Label>
            <p className="text-xs text-muted-foreground">
              Shown above the file picker on the portal upload screen. Leave
              both fields blank to render the upload control with no extra
              copy.
            </p>
          </div>

          {multiLanguageEnabled ? (
            <BilingualInput
              label="Receipt label"
              idPrefix={`receipt-label-${option.id}`}
              placeholderEn="e.g. Flight ticket"
              valueEn={receiptLabel}
              valueAr={receiptLabelAr}
              onChangeEn={setReceiptLabel}
              onChangeAr={setReceiptLabelAr}
              onBlurEn={() => {
                const next = receiptLabel.trim() || null;
                if (next !== (option.receiptLabel ?? null)) {
                  onPatch({ receiptLabel: next }, { receiptLabel: next });
                }
              }}
              onBlurAr={() => {
                const next = receiptLabelAr.trim() || null;
                if (next !== (option.receiptLabelAr ?? null)) {
                  onPatch(
                    { receiptLabelAr: next },
                    { receiptLabelAr: next }
                  );
                }
              }}
            />
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`receipt-label-${option.id}`}>
                Receipt label
              </Label>
              <Input
                id={`receipt-label-${option.id}`}
                placeholder="e.g. Flight ticket"
                value={receiptLabel}
                onChange={(e) => setReceiptLabel(e.target.value)}
                onBlur={() => {
                  const next = receiptLabel.trim() || null;
                  if (next !== (option.receiptLabel ?? null)) {
                    onPatch({ receiptLabel: next }, { receiptLabel: next });
                  }
                }}
              />
            </div>
          )}

          {multiLanguageEnabled ? (
            <BilingualInput
              label="Receipt instructions"
              idPrefix={`receipt-instructions-${option.id}`}
              multiline
              rows={3}
              placeholderEn="e.g. Upload a PDF or photo of your flight confirmation showing arrival date in Riyadh."
              valueEn={receiptInstructions}
              valueAr={receiptInstructionsAr}
              onChangeEn={setReceiptInstructions}
              onChangeAr={setReceiptInstructionsAr}
              onBlurEn={() => {
                const next = receiptInstructions.trim() || null;
                if (next !== (option.receiptInstructions ?? null)) {
                  onPatch(
                    { receiptInstructions: next },
                    { receiptInstructions: next }
                  );
                }
              }}
              onBlurAr={() => {
                const next = receiptInstructionsAr.trim() || null;
                if (next !== (option.receiptInstructionsAr ?? null)) {
                  onPatch(
                    { receiptInstructionsAr: next },
                    { receiptInstructionsAr: next }
                  );
                }
              }}
            />
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`receipt-instructions-${option.id}`}>
                Receipt instructions
              </Label>
              <Textarea
                id={`receipt-instructions-${option.id}`}
                rows={3}
                placeholder="e.g. Upload a PDF or photo of your flight confirmation showing arrival date in Riyadh."
                value={receiptInstructions}
                onChange={(e) => setReceiptInstructions(e.target.value)}
                onBlur={() => {
                  const next = receiptInstructions.trim() || null;
                  if (next !== (option.receiptInstructions ?? null)) {
                    onPatch(
                      { receiptInstructions: next },
                      { receiptInstructions: next }
                    );
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Metadata (key/value)</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setMetaRows((rows) => [...rows, { key: "", value: "" }])
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Row
          </Button>
        </div>
        {metaRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Optional — store anything you want to surface to attendees, such
            as price, address, or check-in time.
          </p>
        ) : (
          <div className="space-y-2">
            {metaRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="key"
                  value={row.key}
                  onChange={(e) => {
                    const next = [...metaRows];
                    next[idx] = { ...row, key: e.target.value };
                    setMetaRows(next);
                  }}
                  onBlur={() => commitMetadata(metaRows)}
                  className="max-w-[200px]"
                />
                <Input
                  placeholder="value"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...metaRows];
                    next[idx] = { ...row, value: e.target.value };
                    setMetaRows(next);
                  }}
                  onBlur={() => commitMetadata(metaRows)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    const next = metaRows.filter((_, i) => i !== idx);
                    setMetaRows(next);
                    commitMetadata(next);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={option.isActive}
            onCheckedChange={(c) =>
              onPatch({ isActive: c }, { isActive: c })
            }
          />
          <div>
            <Label className="font-medium">Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive options stay visible to existing selections but are
              hidden from new picks.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete option
        </Button>
      </div>
    </div>
  );
}
