"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  FileWarning,
  Loader2,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LAYOUT_TYPES, formatFieldValue } from "./field-display";
import {
  type MergedPhase,
  computeCompletion,
} from "./phase-types";

function fmtDateTime(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * One unified card per phase. Folds the four pieces of per-phase state
 * that used to live in three separate cards (Phase Submissions,
 * Selections, Phase Access) plus receipts into a single card with
 * conditional rows. Every mutation call is byte-for-byte the same
 * request the old cards made; only the layout changed.
 */
export function PhaseCard({
  eventId,
  contactId,
  phase,
  canEdit,
  onRefetch,
}: {
  eventId: string;
  contactId: string;
  phase: MergedPhase;
  canEdit: boolean;
  onRefetch: () => Promise<void>;
}) {
  const completion = computeCompletion(phase);
  const sel = phase.selection;
  const showSelectionRow = !!sel && sel.selectionMode !== "NONE";
  const needsReceipt =
    !!sel &&
    (sel.requiresReceiptUpload ||
      sel.options.some((o) => o.requiresReceipt === true));
  const showReceiptRow = showSelectionRow && needsReceipt;

  const windowText = (() => {
    const a = phase.access;
    if (!a.opensAt && !a.closesAt) return null;
    const parts: string[] = [];
    if (a.opensAt)
      parts.push(
        `Opens ${new Date(a.opensAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}`
      );
    if (a.closesAt)
      parts.push(
        `Closes ${new Date(a.closesAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}`
      );
    return parts.join(" · ");
  })();

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="font-medium text-sm truncate">{phase.title}</p>
          <Badge variant={completion.variant} className="shrink-0 text-xs">
            {completion.label}
          </Badge>
        </div>
        {windowText && (
          <span className="text-xs text-muted-foreground shrink-0">
            {windowText}
          </span>
        )}
      </div>

      <div className="divide-y">
        <SubmissionRow phase={phase} />
        {showSelectionRow && (
          <SelectionRow
            eventId={eventId}
            contactId={contactId}
            phase={phase}
            canEdit={canEdit}
            onRefetch={onRefetch}
          />
        )}
        {showReceiptRow && <ReceiptRow eventId={eventId} phase={phase} />}
        <AccessRow
          eventId={eventId}
          contactId={contactId}
          phase={phase}
          canEdit={canEdit}
          onRefetch={onRefetch}
        />
      </div>
    </div>
  );
}

// ─── Submission row ──────────────────────────────────────────────────
// Admin-side submission view is read-only today (there is no admin
// submission editor anywhere in the codebase), so this preserves the
// existing read-only display, collapsed behind a View toggle.

function SubmissionRow({ phase }: { phase: MergedPhase }) {
  const [open, setOpen] = useState(false);
  const sub = phase.submission;
  const submitted = sub?.status === "SUBMITTED";

  const fields: { label: string; value: string }[] = [];
  if (submitted && sub?.data) {
    for (const step of sub.steps) {
      for (const f of step.fields) {
        if (LAYOUT_TYPES.has(f.type)) continue;
        fields.push({
          label: f.label,
          value: formatFieldValue(
            { ...f, isSystem: false },
            sub.data[f.name]
          ),
        });
      }
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Submission
          </p>
          <p className="text-sm font-medium">
            {submitted
              ? `Submitted ${fmtDateTime(sub?.submittedAt) ?? ""}`.trim()
              : "Not submitted"}
          </p>
        </div>
        {submitted && fields.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <ChevronDown className="mr-1 h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="mr-1 h-3.5 w-3.5" />
            )}
            View
          </Button>
        )}
      </div>
      {open && submitted && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Submission recorded but no field values found.
            </p>
          ) : (
            fields.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground w-28 shrink-0">
                  {f.label}
                </span>
                <span className="font-medium break-words">{f.value}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Selection row ───────────────────────────────────────────────────
// Port of selections-card.tsx PhaseRow editing: dropdown (single) /
// checkbox list (multi) + admin notes + Save / Clear + the
// force-capacity confirmation dialog and 409 handling.

function SelectionRow({
  eventId,
  contactId,
  phase,
  canEdit,
  onRefetch,
}: {
  eventId: string;
  contactId: string;
  phase: MergedPhase;
  canEdit: boolean;
  onRefetch: () => Promise<void>;
}) {
  const sel = phase.selection!;
  const isMulti = sel.maxSelections > 1;
  const [editing, setEditing] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>(
    sel.selections.map((s) => s.optionId)
  );
  const [notesDraft, setNotesDraft] = useState<string>(
    sel.selections[0]?.notes ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [forceConfirm, setForceConfirm] = useState<{
    optionId: string;
    label: string;
    taken: number;
    capacity: number;
  } | null>(null);

  useEffect(() => {
    setDraftIds(sel.selections.map((s) => s.optionId));
    setNotesDraft(sel.selections[0]?.notes ?? "");
  }, [sel.selections]);

  const activeOptions = sel.options.filter((o) => o.isActive);

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
        const body = (await res.json().catch(() => null)) as {
          code?: string;
          optionId?: string;
          taken?: number;
          capacity?: number;
        } | null;
        if (body?.code === "OPTION_FULL_ADMIN" && body.optionId) {
          const opt = sel.options.find((o) => o.id === body.optionId);
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
      setEditing(false);
      await onRefetch();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!canEdit) return;
    if (sel.selections.length === 0) return;
    setClearing(true);
    try {
      for (const s of sel.selections) {
        const res = await fetch(
          `/api/events/${eventId}/contacts/${contactId}/selections/${s.id}`,
          { method: "DELETE", credentials: "same-origin" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          toast.error(body?.error ?? "Clear failed.");
          return;
        }
      }
      toast.success("Cleared.");
      setEditing(false);
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
          : cur.length < sel.maxSelections
          ? [...cur, optionId]
          : cur
      );
    } else {
      setDraftIds([optionId]);
    }
  }

  const picked = sel.selections.length > 0;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Selection
          </p>
          {picked ? (
            <div className="space-y-1 mt-0.5">
              {sel.selections.map((s) => (
                <div key={s.id} className="text-sm">
                  <span className="font-medium">{s.optionLabel}</span>{" "}
                  <Badge variant="secondary" className="text-[10px] align-middle">
                    {s.source === "ADMIN_ASSIGNED"
                      ? "Admin assigned"
                      : "Attendee picked"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium">
              {sel.selectionMode === "ADMIN_ASSIGNED"
                ? "Pending — no assignment yet"
                : "Not selected"}
            </p>
          )}
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "Close" : "Change"}
          </Button>
        )}
      </div>

      {canEdit && editing && (
        <div className="mt-3 space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{picked ? "Reassign to" : "Assign"}</Label>
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
                          id={`opt-${phase.id}-${opt.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleDraft(opt.id)}
                          disabled={
                            !checked && draftIds.length >= sel.maxSelections
                          }
                        />
                        <Label
                          htmlFor={`opt-${phase.id}-${opt.id}`}
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

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => save(false)}
              disabled={saving || clearing || draftIds.length === 0}
            >
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
            {picked && (
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
            <strong>{forceConfirm?.label}</strong> is at {forceConfirm?.taken}/
            {forceConfirm?.capacity}. Assigning will put it at{" "}
            {(forceConfirm?.taken ?? 0) + 1}/{forceConfirm?.capacity}. Continue?
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

// ─── Receipt row ─────────────────────────────────────────────────────
// Admins cannot upload receipts (upload is portal-only — see audit), so
// this row is informational: view an uploaded receipt, or surface the
// "required · not uploaded" warning. No Upload button is rendered.

function ReceiptRow({
  eventId,
  phase,
}: {
  eventId: string;
  phase: MergedPhase;
}) {
  const sel = phase.selection!;
  const withReceipt = sel.selections.find((s) => s.hasReceipt && s.receipt);
  const anyRequiresReceipt =
    sel.requiresReceiptUpload ||
    sel.selections.some((s) => {
      const opt = sel.options.find((o) => o.id === s.optionId);
      return opt?.requiresReceipt === true;
    });

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Receipt
          </p>
          {withReceipt && withReceipt.receipt ? (
            <p className="text-sm font-medium truncate">
              {withReceipt.receipt.originalName}
            </p>
          ) : anyRequiresReceipt ? (
            <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
              <FileWarning className="h-3.5 w-3.5" />
              Required · not uploaded
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not required</p>
          )}
        </div>
        {withReceipt && withReceipt.receipt && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a
              href={`/api/events/${eventId}/receipts/${withReceipt.receipt.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              View
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Access row ──────────────────────────────────────────────────────
// Port of the old Phase Access card controls + reason dialog.

function AccessRow({
  eventId,
  contactId,
  phase,
  canEdit,
  onRefetch,
}: {
  eventId: string;
  contactId: string;
  phase: MergedPhase;
  canEdit: boolean;
  onRefetch: () => Promise<void>;
}) {
  const a = phase.access;
  const [dialog, setDialog] = useState<{
    nextStatus: "OPEN" | "LOCKED";
    reason: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(status: "OPEN" | "LOCKED" | null, reason: string | null) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/phase-access`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phaseId: phase.id, status, reason }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update phase access");
        return;
      }
      setDialog(null);
      toast.success(
        status === null
          ? "Phase override cleared"
          : status === "OPEN"
          ? "Phase forced open for this attendee"
          : "Phase locked for this attendee"
      );
      await onRefetch();
    } catch {
      toast.error("Failed to update phase access");
    } finally {
      setSaving(false);
    }
  }

  const overrideText =
    a.override === "OPEN"
      ? "Force open"
      : a.override === "LOCKED"
      ? "Force lock"
      : "Default (date-based)";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Access
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge
              variant={
                a.override === "OPEN"
                  ? "default"
                  : a.override === "LOCKED"
                  ? "destructive"
                  : "outline"
              }
              className="text-xs"
            >
              {overrideText}
            </Badge>
            {a.override && a.reason && (
              <span className="text-xs text-muted-foreground italic">
                {a.reason}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5 shrink-0 justify-end">
            {a.override !== null && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => submit(null, null)}
              >
                Reset
              </Button>
            )}
            <Button
              variant={a.override === "OPEN" ? "default" : "outline"}
              size="sm"
              disabled={a.override === "OPEN" || saving}
              onClick={() =>
                setDialog({ nextStatus: "OPEN", reason: a.reason ?? "" })
              }
            >
              <Unlock className="mr-1 h-3.5 w-3.5" />
              Force open
            </Button>
            <Button
              variant={a.override === "LOCKED" ? "destructive" : "outline"}
              size="sm"
              disabled={a.override === "LOCKED" || saving}
              onClick={() =>
                setDialog({ nextStatus: "LOCKED", reason: a.reason ?? "" })
              }
            >
              <Lock className="mr-1 h-3.5 w-3.5" />
              Force lock
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.nextStatus === "OPEN"
                ? "Force open this phase"
                : "Lock this phase"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.nextStatus === "OPEN"
                ? `Override the schedule and let this attendee fill "${phase.title}" right now.`
                : `Prevent this attendee from filling "${phase.title}", regardless of the schedule.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reason-${phase.id}`}>Reason (optional)</Label>
            <Textarea
              id={`reason-${phase.id}`}
              rows={3}
              placeholder="e.g. Travelling early, attending a different track, etc."
              value={dialog?.reason ?? ""}
              onChange={(e) =>
                setDialog((prev) =>
                  prev ? { ...prev, reason: e.target.value } : prev
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Visible to admins on this attendee&apos;s record. Not shown to the
              attendee.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!dialog) return;
                submit(dialog.nextStatus, dialog.reason.trim() || null);
              }}
              disabled={saving}
              variant={dialog?.nextStatus === "LOCKED" ? "destructive" : "default"}
            >
              {saving
                ? "Saving..."
                : dialog?.nextStatus === "OPEN"
                ? "Force open"
                : "Lock phase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
