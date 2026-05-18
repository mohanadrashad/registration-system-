"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ClipboardList,
  Eye,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { PhaseSelectionMode } from "@prisma/client";

// ─── Wire-format types ───────────────────────────────────────────────

interface PhaseOption {
  id: string;
  label: string;
  labelAr: string | null;
  capacity: number | null;
  taken: number;
  full: boolean;
  isActive: boolean;
  requiresReceipt: boolean | null;
}

interface ExistingSelection {
  id: string;
  optionId: string;
  optionLabel: string;
  optionLabelAr: string | null;
  source: "ADMIN_ASSIGNED" | "ATTENDEE_PICKED";
  assignedAt: string;
  assignedBy: string | null;
  assignedByUser: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  notes: string | null;
  hasReceipt: boolean;
  receipt: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
  } | null;
}

interface PhaseEntry {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  isRequired: boolean;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  options: PhaseOption[];
  selections: ExistingSelection[];
}

interface SelectionsResponse {
  registrationId: string;
  phases: PhaseEntry[];
}

interface SelectionsCardProps {
  eventId: string;
  contactId: string;
  canEdit: boolean;
}

/**
 * Per-phase admin assignment + override surface. One block per
 * option-bearing phase, each with a reassign control (dropdown for
 * single-pick, checkbox list for multi-pick), notes textarea, Save /
 * Clear actions, and a force-capacity confirmation dialog.
 *
 * The card fetches its own data so the rest of the attendee detail
 * page doesn't need to thread it through. Refetches after every
 * successful write so the option counts + audit fields stay live.
 */
export function SelectionsCard({
  eventId,
  contactId,
  canEdit,
}: SelectionsCardProps) {
  const [data, setData] = useState<SelectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/selections`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        if (res.status === 403) {
          // Module gate or per-event role. Quietly hide the card.
          setData({ registrationId: "", phases: [] });
          return;
        }
        toast.error("Couldn't load selections.");
        return;
      }
      const json = (await res.json()) as SelectionsResponse;
      setData(json);
    } catch {
      toast.error("Couldn't load selections.");
    } finally {
      setLoading(false);
    }
  }, [eventId, contactId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Selections</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  // No data after load → either the module is off or there are no
  // option-bearing phases. Either way nothing to render.
  if (!data || data.phases.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Selections
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Per-phase admin assignments and overrides for this attendee.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.phases.map((phase) => (
          <PhaseRow
            key={phase.id}
            eventId={eventId}
            contactId={contactId}
            phase={phase}
            canEdit={canEdit}
            onRefetch={refetch}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Per-phase row ───────────────────────────────────────────────────

function PhaseRow({
  eventId,
  contactId,
  phase,
  canEdit,
  onRefetch,
}: {
  eventId: string;
  contactId: string;
  phase: PhaseEntry;
  canEdit: boolean;
  onRefetch: () => Promise<void>;
}) {
  // Draft option selection. Single-pick keeps an array of length 0 or
  // 1 so the same Save handler covers both shapes.
  const isMulti = phase.maxSelections > 1;
  const [draftIds, setDraftIds] = useState<string[]>(
    phase.selections.map((s) => s.optionId)
  );
  const [notesDraft, setNotesDraft] = useState<string>(
    phase.selections[0]?.notes ?? ""
  );
  // Reset drafts whenever the upstream phase data changes (e.g. after
  // a refetch following a save).
  useEffect(() => {
    setDraftIds(phase.selections.map((s) => s.optionId));
    setNotesDraft(phase.selections[0]?.notes ?? "");
  }, [phase.selections]);

  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [forceConfirm, setForceConfirm] = useState<{
    optionId: string;
    label: string;
    taken: number;
    capacity: number;
  } | null>(null);

  const activeOptions = phase.options.filter((o) => o.isActive);

  async function save(force = false) {
    if (!canEdit) return;
    if (draftIds.length === 0) {
      toast.error("Pick at least one option, or use Clear to remove all.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/selections`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phaseId: phase.id,
            optionIds: draftIds,
            notes: notesDraft.trim() || null,
            force,
          }),
        }
      );
      if (res.status === 409) {
        // Capacity conflict. Server returns the offending option.
        const body = (await res.json().catch(() => null)) as {
          code?: string;
          optionId?: string;
          taken?: number;
          capacity?: number;
        } | null;
        if (body?.code === "OPTION_FULL_ADMIN" && body.optionId) {
          const opt = phase.options.find((o) => o.id === body.optionId);
          setForceConfirm({
            optionId: body.optionId,
            label: opt?.label ?? "this option",
            taken: body.taken ?? 0,
            capacity: body.capacity ?? 0,
          });
          return;
        }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Save failed.");
        return;
      }
      const body = (await res.json()) as { overCapacity?: unknown[] };
      if (Array.isArray(body.overCapacity) && body.overCapacity.length > 0) {
        toast.warning(
          "Saved past capacity — some options are now over their limit."
        );
      } else {
        toast.success("Saved.");
      }
      await onRefetch();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!canEdit) return;
    if (phase.selections.length === 0) return;
    setClearing(true);
    try {
      // Spec semantics: "Clear an assignment". We delete each row
      // individually rather than re-using the PUT (an empty optionIds
      // would 400 on the schema's max(50) check passing but
      // semantically would map to "no selections" which the PUT
      // refuses for safety). Per-row DELETE is the cleanest.
      for (const sel of phase.selections) {
        const res = await fetch(
          `/api/events/${eventId}/contacts/${contactId}/selections/${sel.id}`,
          { method: "DELETE", credentials: "same-origin" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          toast.error(body?.error ?? "Clear failed.");
          return;
        }
      }
      toast.success("Cleared.");
      await onRefetch();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setClearing(false);
    }
  }

  function toggleDraft(optionId: string) {
    if (isMulti) {
      setDraftIds((cur) =>
        cur.includes(optionId)
          ? cur.filter((id) => id !== optionId)
          : cur.length < phase.maxSelections
          ? [...cur, optionId]
          : cur
      );
    } else {
      setDraftIds([optionId]);
    }
  }

  // ── Render branches ──

  const summary = (() => {
    if (phase.selections.length === 0) {
      if (phase.selectionMode === "ADMIN_ASSIGNED") {
        return "Status: pending — no assignment yet";
      }
      return "No selection yet";
    }
    return null;
  })();

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-medium">{phase.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mode: {phase.selectionMode}
            {phase.isRequired && " · Required"}
            {phase.maxSelections > 1 &&
              ` · Up to ${phase.maxSelections} selections`}
          </p>
        </div>
        {phase.selections.some((s) => s.source === "ADMIN_ASSIGNED") && (
          <Badge variant="secondary" className="text-xs">
            Admin-assigned
          </Badge>
        )}
      </div>

      {/* Current selection(s) summary */}
      {summary ? (
        <p className="text-sm text-muted-foreground mb-3">{summary}</p>
      ) : (
        <div className="space-y-1.5 mb-3 text-sm">
          {phase.selections.map((sel) => (
            <div key={sel.id} className="flex items-start gap-2">
              <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="font-medium">{sel.optionLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {sel.source === "ADMIN_ASSIGNED"
                    ? `Admin-assigned${
                        sel.assignedByUser?.email
                          ? ` by ${sel.assignedByUser.email}`
                          : ""
                      }`
                    : "Attendee-picked"}
                  {" · "}
                  {new Date(sel.assignedAt).toLocaleString()}
                </p>
                {sel.hasReceipt && sel.receipt && (
                  <div className="mt-1 flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" className="h-7">
                      <a
                        href={`/api/events/${eventId}/receipts/${sel.receipt.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View receipt
                      </a>
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {sel.receipt.originalName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit controls */}
      {canEdit && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {phase.selections.length > 0 ? "Reassign to" : "Assign"}
            </Label>
            {isMulti ? (
              <div className="space-y-1.5">
                {activeOptions.map((opt) => {
                  const checked = draftIds.includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      className="flex items-center justify-between gap-3 rounded border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`opt-${opt.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleDraft(opt.id)}
                          disabled={
                            !checked && draftIds.length >= phase.maxSelections
                          }
                        />
                        <Label
                          htmlFor={`opt-${opt.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {opt.label}
                        </Label>
                      </div>
                      <span
                        className={`text-xs ${
                          opt.full
                            ? "text-destructive font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        {opt.capacity == null
                          ? "no cap"
                          : `${opt.taken}/${opt.capacity}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Select
                value={draftIds[0] ?? ""}
                onValueChange={(v) => setDraftIds(v ? [v] : [])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an option…" />
                </SelectTrigger>
                <SelectContent>
                  {activeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                      {opt.capacity != null && (
                        <span
                          className={`ml-2 text-xs ${
                            opt.full
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          · {opt.taken}/{opt.capacity}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes (admin-only)</Label>
            <Textarea
              rows={2}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="e.g. VIP, dietary, accessibility…"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => save(false)}
              disabled={saving || clearing || draftIds.length === 0}
            >
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
            {phase.selections.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={clearAll}
                disabled={saving || clearing}
                className="text-destructive hover:text-destructive"
              >
                {clearing && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                )}
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clear assignment
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Force-capacity confirm */}
      <Dialog
        open={!!forceConfirm}
        onOpenChange={(open) => !open && setForceConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Option is at capacity
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{forceConfirm?.label}</strong> is at{" "}
            {forceConfirm?.taken}/{forceConfirm?.capacity}. Assigning will
            put it at {(forceConfirm?.taken ?? 0) + 1}/
            {forceConfirm?.capacity}. Continue?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForceConfirm(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setForceConfirm(null);
                await save(true);
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Assign anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

