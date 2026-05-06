"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { PhaseSelectionMode } from "@prisma/client";

// ─── Types — kept local to the panel so page.tsx doesn't bloat. ──────

export interface PhaseOption {
  id: string;
  label: string;
  labelAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  externalUrl: string | null;
  capacity: number | null;
  metadata: Record<string, string> | null;
  requiresReceipt: boolean | null;
  isActive: boolean;
  order: number;
  _count?: { selections: number };
}

export interface PhaseOptionsPanelData {
  id: string;
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  options: PhaseOption[];
}

const SELECTION_MODE_LABELS: Record<PhaseSelectionMode, string> = {
  NONE: "Off",
  ADMIN_ASSIGNED: "Admin assigns for everyone",
  ATTENDEE_PICKS: "Attendees pick",
  MIXED: "Mixed (admin or attendee)",
  EXTERNAL_BOOKING: "External booking (info only + receipt)",
};

const SELECTION_MODE_DESCRIPTIONS: Record<PhaseSelectionMode, string> = {
  NONE: "",
  ADMIN_ASSIGNED:
    "Admin assigns each attendee an option. Attendees see their assignment read-only.",
  ATTENDEE_PICKS:
    "Attendees pick their own option from the list. Capacity limits apply.",
  MIXED:
    "Admin can pre-assign some attendees; the rest pick for themselves.",
  EXTERNAL_BOOKING:
    "Options are informational (e.g. hotels with booking links). Attendees book elsewhere and upload a receipt.",
};

const MODES_WITH_MAX_SELECTIONS: PhaseSelectionMode[] = [
  "ATTENDEE_PICKS",
  "MIXED",
];

interface PhaseOptionsPanelProps {
  eventId: string;
  phase: PhaseOptionsPanelData;
  onChange: () => void; // triggers a parent refetch
}

export function PhaseOptionsPanel({
  eventId,
  phase,
  onChange,
}: PhaseOptionsPanelProps) {
  // Panel auto-expands when this phase already has options enabled, so an
  // admin re-opening the page lands directly on the configuration.
  const [expanded, setExpanded] = useState(phase.selectionMode !== "NONE");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [deleteGuard, setDeleteGuard] = useState<{
    optionId: string;
    label: string;
    selectionCount: number;
  } | null>(null);

  // Local state mirrors the phase-level selection knobs so the inputs feel
  // responsive — committed to the server on change/blur.
  const [maxSelectionsDraft, setMaxSelectionsDraft] = useState(
    String(phase.maxSelections)
  );
  useEffect(() => {
    setMaxSelectionsDraft(String(phase.maxSelections));
  }, [phase.id, phase.maxSelections]);

  // Re-sync expansion state when switching to a different phase.
  useEffect(() => {
    setExpanded(phase.selectionMode !== "NONE");
    setEditingOptionId(null);
  }, [phase.id, phase.selectionMode]);

  const enabled = phase.selectionMode !== "NONE";
  const showMaxSelections = MODES_WITH_MAX_SELECTIONS.includes(
    phase.selectionMode
  );

  async function patchPhase(patch: Partial<PhaseOptionsPanelData>) {
    const res = await fetch(`/api/events/${eventId}/phases/${phase.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to update phase");
      return;
    }
    onChange();
  }

  async function toggleEnabled(checked: boolean) {
    if (checked) {
      // Default mode on first enable per Stage 2 mockup decision.
      await patchPhase({ selectionMode: "ATTENDEE_PICKS" });
      setExpanded(true);
    } else {
      await patchPhase({ selectionMode: "NONE" });
      setExpanded(false);
    }
  }

  async function changeMode(mode: PhaseSelectionMode) {
    await patchPhase({ selectionMode: mode });
  }

  async function commitMaxSelections() {
    const n = parseInt(maxSelectionsDraft, 10);
    if (!Number.isFinite(n) || n < 1) {
      // Reset to the persisted value rather than write garbage.
      setMaxSelectionsDraft(String(phase.maxSelections));
      return;
    }
    if (n === phase.maxSelections) return;
    await patchPhase({ maxSelections: n });
  }

  async function addOption() {
    const res = await fetch(
      `/api/events/${eventId}/phases/${phase.id}/options`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: `Option ${phase.options.length + 1}`,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to add option");
      return;
    }
    const created = (await res.json()) as PhaseOption;
    toast.success("Option added");
    onChange();
    // Drop straight into edit mode on the new row.
    setEditingOptionId(created.id);
  }

  async function reorderOption(optionId: string, direction: "up" | "down") {
    const res = await fetch(
      `/api/events/${eventId}/phases/${phase.id}/options/${optionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      }
    );
    if (!res.ok) {
      toast.error("Failed to reorder option");
      return;
    }
    onChange();
  }

  async function deleteOption(optionId: string) {
    const res = await fetch(
      `/api/events/${eventId}/phases/${phase.id}/options/${optionId}`,
      { method: "DELETE" }
    );
    if (res.status === 409) {
      // Server returns the live selection count; surface the deactivate-instead
      // dialog with that number so the admin can decide.
      const body = (await res
        .json()
        .catch(() => null)) as { selectionCount?: number } | null;
      const opt = phase.options.find((o) => o.id === optionId);
      setDeleteGuard({
        optionId,
        label: opt?.label ?? "this option",
        selectionCount: body?.selectionCount ?? 0,
      });
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to delete option");
      return;
    }
    toast.success("Option deleted");
    onChange();
  }

  async function deactivateOption(optionId: string) {
    const res = await fetch(
      `/api/events/${eventId}/phases/${phase.id}/options/${optionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }
    );
    if (!res.ok) {
      toast.error("Failed to deactivate option");
      return;
    }
    toast.success("Option deactivated");
    setDeleteGuard(null);
    onChange();
  }

  return (
    <div className="rounded-lg border bg-muted/20">
      {/* Panel header — clickable row that toggles expansion. The Switch */}
      {/* is the source of truth for selectionMode != NONE. */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">Options</span>
            {enabled && (
              <Badge variant="secondary" className="text-xs">
                {SELECTION_MODE_LABELS[phase.selectionMode]}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Let attendees pick from a pre-defined list (hotels, workshops, …).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={enabled}
              onCheckedChange={toggleEnabled}
              aria-label="Use options for this phase"
            />
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && enabled && (
        <div className="space-y-4 border-t bg-background px-4 py-4">
          {/* Selection mode + max selections */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Selection mode</Label>
              <Select
                value={phase.selectionMode}
                onValueChange={(v) => changeMode(v as PhaseSelectionMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN_ASSIGNED">
                    {SELECTION_MODE_LABELS.ADMIN_ASSIGNED}
                  </SelectItem>
                  <SelectItem value="ATTENDEE_PICKS">
                    {SELECTION_MODE_LABELS.ATTENDEE_PICKS}
                  </SelectItem>
                  <SelectItem value="MIXED">
                    {SELECTION_MODE_LABELS.MIXED}
                  </SelectItem>
                  <SelectItem value="EXTERNAL_BOOKING">
                    {SELECTION_MODE_LABELS.EXTERNAL_BOOKING}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SELECTION_MODE_DESCRIPTIONS[phase.selectionMode]}
              </p>
            </div>

            {showMaxSelections && (
              <div className="space-y-2">
                <Label>Max selections per attendee</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={maxSelectionsDraft}
                  onChange={(e) => setMaxSelectionsDraft(e.target.value)}
                  onBlur={commitMaxSelections}
                />
                <p className="text-xs text-muted-foreground">
                  Use 1 for single-pick (default). Greater values allow
                  multi-pick scenarios like &ldquo;pick 3 of 8 workshops.&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* Allow-change + require-receipt toggles */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch
                checked={phase.allowChangeAfterSubmit}
                onCheckedChange={(c) =>
                  patchPhase({ allowChangeAfterSubmit: c })
                }
              />
              <div>
                <Label className="font-medium">Allow change after submit</Label>
                <p className="text-xs text-muted-foreground">
                  Off — selection locks once submitted. On — attendees can
                  change until the phase closes.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch
                checked={phase.requiresReceiptUpload}
                onCheckedChange={(c) =>
                  patchPhase({ requiresReceiptUpload: c })
                }
              />
              <div>
                <Label className="font-medium">Require receipt upload</Label>
                <p className="text-xs text-muted-foreground">
                  Phase-level default. Each option can override (Inherit /
                  Always / Never).
                </p>
              </div>
            </div>
          </div>

          {/* Options list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Options list</Label>
              <Button size="sm" variant="outline" onClick={addOption}>
                <Plus className="mr-2 h-4 w-4" /> Add option
              </Button>
            </div>

            {phase.options.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No options yet. Add one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {phase.options.map((option, idx) => (
                  <OptionRow
                    key={option.id}
                    eventId={eventId}
                    phaseId={phase.id}
                    option={option}
                    isFirst={idx === 0}
                    isLast={idx === phase.options.length - 1}
                    isEditing={editingOptionId === option.id}
                    phaseRequiresReceipt={phase.requiresReceiptUpload}
                    onToggleEdit={() =>
                      setEditingOptionId((current) =>
                        current === option.id ? null : option.id
                      )
                    }
                    onMove={(d) => reorderOption(option.id, d)}
                    onDelete={() => deleteOption(option.id)}
                    onChanged={onChange}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete-guard dialog: option is in use by selections. Stage 2 only */}
      {/* offers Cancel + Deactivate; Reassign ships in Stage 5. */}
      <Dialog
        open={!!deleteGuard}
        onOpenChange={(open) => !open && setDeleteGuard(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cannot delete &ldquo;{deleteGuard?.label}&rdquo;
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteGuard?.selectionCount} attendee
            {deleteGuard?.selectionCount === 1 ? " has" : "s have"} selected
            this option. Deactivating hides it from new picks while keeping
            their existing selections intact.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGuard(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                deleteGuard && deactivateOption(deleteGuard.optionId)
              }
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── OptionRow: collapsed summary + ⋯ menu, expands to full editor. ──

interface OptionRowProps {
  eventId: string;
  phaseId: string;
  option: PhaseOption;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  phaseRequiresReceipt: boolean;
  onToggleEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onChanged: () => void;
}

function OptionRow({
  eventId,
  phaseId,
  option,
  isFirst,
  isLast,
  isEditing,
  phaseRequiresReceipt,
  onToggleEdit,
  onMove,
  onDelete,
  onChanged,
}: OptionRowProps) {
  const selectionCount = option._count?.selections ?? 0;
  const capacityBadge = useMemo(() => {
    if (option.capacity == null) return "no cap";
    return `${selectionCount} / ${option.capacity}`;
  }, [option.capacity, selectionCount]);

  const receiptBadge = useMemo(() => {
    if (option.requiresReceipt === true) return "Receipt: required";
    if (option.requiresReceipt === false) return "Receipt: never";
    return `Receipt: inherit (${phaseRequiresReceipt ? "required" : "off"})`;
  }, [option.requiresReceipt, phaseRequiresReceipt]);

  return (
    <div
      className={`rounded-md border bg-background ${
        !option.isActive ? "opacity-60" : ""
      }`}
    >
      {/* Collapsed summary row */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{option.label}</span>
            {!option.isActive && (
              <Badge variant="outline" className="text-xs">
                Inactive
              </Badge>
            )}
            {option.externalUrl && (
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          {option.labelAr && (
            <div
              dir="rtl"
              className="text-xs text-muted-foreground truncate"
            >
              {option.labelAr}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{capacityBadge}</span>
          <span>·</span>
          <span>{receiptBadge}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onMove("up")}
              disabled={isFirst}
            >
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onMove("down")}
              disabled={isLast}
            >
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              {isEditing ? "Close editor" : "Edit"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isEditing && (
        <OptionEditor
          eventId={eventId}
          phaseId={phaseId}
          option={option}
          phaseRequiresReceipt={phaseRequiresReceipt}
          onChanged={onChanged}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// ─── OptionEditor: full edit form — bilingual labels, URL, capacity, ──
// ─── 3-state requiresReceipt, metadata key/value, active toggle. ─────

interface OptionEditorProps {
  eventId: string;
  phaseId: string;
  option: PhaseOption;
  phaseRequiresReceipt: boolean;
  onChanged: () => void;
  onDelete: () => void;
}

function OptionEditor({
  eventId,
  phaseId,
  option,
  phaseRequiresReceipt,
  onChanged,
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

  // Re-sync local state when the option object changes (e.g., after a move).
  useEffect(() => {
    setLabel(option.label);
    setLabelAr(option.labelAr ?? "");
    setDescription(option.description ?? "");
    setDescriptionAr(option.descriptionAr ?? "");
    setExternalUrl(option.externalUrl ?? "");
    setCapacity(option.capacity == null ? "" : String(option.capacity));
  }, [
    option.id,
    option.label,
    option.labelAr,
    option.description,
    option.descriptionAr,
    option.externalUrl,
    option.capacity,
  ]);

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
  }, [option.id, option.metadata]);

  // 3-state requiresReceipt → string for the radio group (which only takes
  // strings). Maps null=inherit, true=always, false=never.
  const requiresReceiptValue = useMemo(() => {
    if (option.requiresReceipt === null) return "inherit";
    return option.requiresReceipt ? "always" : "never";
  }, [option.requiresReceipt]);

  async function patchOption(patch: Record<string, unknown>) {
    const res = await fetch(
      `/api/events/${eventId}/phases/${phaseId}/options/${option.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to update option");
      return false;
    }
    onChanged();
    return true;
  }

  function commitMetadata(rows: { key: string; value: string }[]) {
    const cleaned: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      cleaned[k] = r.value;
    }
    patchOption({
      metadata: Object.keys(cleaned).length === 0 ? null : cleaned,
    });
  }

  async function commitRequiresReceipt(value: string) {
    let next: boolean | null;
    if (value === "always") next = true;
    else if (value === "never") next = false;
    else next = null; // "inherit"
    await patchOption({ requiresReceipt: next });
  }

  async function commitCapacity() {
    const trimmed = capacity.trim();
    if (trimmed === "") {
      if (option.capacity !== null) await patchOption({ capacity: null });
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) {
      // Reset to last persisted value rather than write garbage.
      setCapacity(option.capacity == null ? "" : String(option.capacity));
      return;
    }
    if (n !== option.capacity) await patchOption({ capacity: n });
  }

  const selectionCount = option._count?.selections ?? 0;

  return (
    <div className="space-y-4 border-t bg-muted/20 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Label (English)</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              const trimmed = label.trim();
              if (trimmed && trimmed !== option.label) {
                patchOption({ label: trimmed });
              } else if (!trimmed) {
                setLabel(option.label);
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Label (Arabic)</Label>
          <Input
            dir="rtl"
            value={labelAr}
            onChange={(e) => setLabelAr(e.target.value)}
            onBlur={() => {
              const next = labelAr.trim() || null;
              if (next !== (option.labelAr ?? null)) {
                patchOption({ labelAr: next });
              }
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Description (English)</Label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              const next = description.trim() || null;
              if (next !== (option.description ?? null)) {
                patchOption({ description: next });
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Description (Arabic)</Label>
          <Textarea
            dir="rtl"
            rows={2}
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            onBlur={() => {
              const next = descriptionAr.trim() || null;
              if (next !== (option.descriptionAr ?? null)) {
                patchOption({ descriptionAr: next });
              }
            }}
          />
        </div>
      </div>

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
              patchOption({ externalUrl: next });
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
            onCheckedChange={(c) => patchOption({ isActive: c })}
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
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete option
        </Button>
      </div>
    </div>
  );
}
