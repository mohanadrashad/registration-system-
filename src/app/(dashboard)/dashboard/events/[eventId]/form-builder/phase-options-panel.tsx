"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { PhaseSelectionMode } from "@prisma/client";
import { fetchJson, type FriendlyError } from "@/lib/api-errors-client";
import { OptionRow } from "./option-row";
import {
  SELECTION_MODE_LABELS,
  SELECTION_MODE_DESCRIPTIONS,
  MODES_WITH_MAX_SELECTIONS,
  type PhaseOption,
  type PhaseOptionsPanelData,
} from "./phase-option-types";

// Re-exported so existing `from "./phase-options-panel"` type imports keep
// working; the definitions now live in phase-option-types.ts.
export type { PhaseOption, PhaseOptionsPanelData };

interface PhaseOptionsPanelProps {
  eventId: string;
  phase: PhaseOptionsPanelData;
  /**
   * Recovery-only refetch. The panel calls this on 409-concurrency failures
   * so the parent can pull fresh data from the server. The panel re-seeds
   * its local state from the next prop snapshot. Never called on the happy
   * path — optimistic updates handle that.
   */
  onRefetch: () => Promise<void> | void;
  /**
   * Whether the event has the `multiLanguage` module on. Threaded through
   * to OptionEditor so the new (Category-Phases stage 3) receipt-label /
   * receipt-instructions Arabic inputs hide on monolingual events. The
   * existing labelAr / descriptionAr inputs intentionally stay always-on
   * — that pre-Stage-3 quirk is out of scope for this PR.
   */
  multiLanguageEnabled: boolean;
}

/**
 * The panel maintains its own optimistic state for selection-mode toggles,
 * the four phase-level switches, and the entire options list. Mutations
 * apply locally first, then send to the server. On success: reconcile with
 * the server's returned row (server wins past that point). On failure:
 * roll local state back to the snapshot taken before the optimistic write,
 * surface a clear toast, and keep a red error indicator on the affected
 * row until the next successful mutation clears it.
 *
 * Concurrency: each option's PATCH carries `expectedUpdatedAt`. If another
 * tab / admin saved a newer version, the server returns 409. We then call
 * `onRefetch` and force-reseed from the next prop snapshot. Phase-level
 * patches use the same mechanism for the phase row.
 */
export function PhaseOptionsPanel({
  eventId,
  phase,
  onRefetch,
  multiLanguageEnabled,
}: PhaseOptionsPanelProps) {
  // ── Local optimistic state. Source of truth for the rendered UI. ──
  const [localPhase, setLocalPhase] = useState(() => extractPhaseState(phase));
  const [localOptions, setLocalOptions] = useState<PhaseOption[]>(
    () => phase.options
  );

  // Pending / error visuals — keyed by "phase" or option.id.
  const [pendingPhase, setPendingPhase] = useState(false);
  const [pendingOptions, setPendingOptions] = useState<Set<string>>(new Set());
  const [errorPhase, setErrorPhase] = useState<string | null>(null);
  const [errorOptions, setErrorOptions] = useState<
    Record<string, string | null>
  >({});

  // ── Pure UI state — never triggers network. ──
  const [expanded, setExpanded] = useState(phase.selectionMode !== "NONE");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [deleteGuard, setDeleteGuard] = useState<{
    optionId: string;
    label: string;
    selectionCount: number;
  } | null>(null);

  // ── Re-seed local state on phase navigation OR explicit force-reseed. ──
  // forceReseed is used by 409 handlers: after onRefetch resolves, the parent
  // re-renders the panel with fresh props; this flag tells the effect to
  // accept those props as the new ground truth even though phase.id hasn't
  // changed. Without the flag we'd ignore prop updates after mount.
  const [forceReseed, setForceReseed] = useState(0);
  const seededIdRef = useRef<string>(phase.id);
  useEffect(() => {
    if (seededIdRef.current !== phase.id || forceReseed > 0) {
      setLocalPhase(extractPhaseState(phase));
      setLocalOptions(phase.options);
      setPendingPhase(false);
      setPendingOptions(new Set());
      setErrorPhase(null);
      setErrorOptions({});
      setEditingOptionId(null);
      setExpanded(phase.selectionMode !== "NONE");
      seededIdRef.current = phase.id;
    }
  }, [phase, forceReseed]);

  // ── Per-option request lock. Serialises mutations on the same option so
  // ── two rapid blurs don't race. The phase row uses a separate single lock.
  const optionLocks = useRef(new Map<string, Promise<unknown>>());
  const phaseLockRef = useRef<Promise<unknown> | null>(null);

  // ── Helpers to mutate the pending/error visuals. ──
  const setOptionPending = useCallback((id: string, pending: boolean) => {
    setPendingOptions((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const setOptionError = useCallback((id: string, message: string | null) => {
    setErrorOptions((prev) => ({ ...prev, [id]: message }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Phase-level mutations
  // ─────────────────────────────────────────────────────────────────────

  const patchPhase = useCallback(
    async (
      patch: Partial<{
        selectionMode: PhaseSelectionMode;
        maxSelections: number;
        allowChangeAfterSubmit: boolean;
        requiresReceiptUpload: boolean;
      }>,
      optimistic: Partial<typeof localPhase>
    ) => {
      // Serialise phase patches behind a single per-panel lock — sequential
      // toggles must apply in order, otherwise the server's expectedUpdatedAt
      // check trips them up.
      const prior = phaseLockRef.current;
      const run = (async () => {
        if (prior) await prior.catch(() => {});

        // Snapshot current state so we can roll back on failure.
        const snapshot = localPhase;
        // Optimistic update — UI updates instantly.
        setLocalPhase((p) => ({ ...p, ...optimistic }));
        setPendingPhase(true);
        setErrorPhase(null);

        const result = await fetchJson<{
          id: string;
          selectionMode: PhaseSelectionMode;
          maxSelections: number;
          allowChangeAfterSubmit: boolean;
          requiresReceiptUpload: boolean;
          updatedAt: string;
        }>(
          `/api/events/${eventId}/phases/${phase.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...patch,
              expectedUpdatedAt: snapshot.updatedAt,
            }),
          },
          "phase settings"
        );

        setPendingPhase(false);

        if (result.ok) {
          // Server wins past this point: reconcile to its returned row.
          setLocalPhase((p) => ({
            ...p,
            selectionMode: result.data.selectionMode,
            maxSelections: result.data.maxSelections,
            allowChangeAfterSubmit: result.data.allowChangeAfterSubmit,
            requiresReceiptUpload: result.data.requiresReceiptUpload,
            updatedAt: result.data.updatedAt,
          }));
          return;
        }

        // Failure path: rollback + surface error.
        setLocalPhase(snapshot);
        if (result.error.code === "PHASE_CONCURRENCY") {
          await handleConcurrencyConflict(result.error);
        } else {
          setErrorPhase(result.error.message);
          toast.error(result.error.message);
        }
      })();

      phaseLockRef.current = run.catch(() => {});
      return run;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, phase.id, localPhase]
  );

  // ── 409 conflict path: tell parent to refetch, re-seed on next render. ──
  const handleConcurrencyConflict = useCallback(
    async (err: FriendlyError) => {
      toast.warning(err.message);
      try {
        await onRefetch();
      } catch {
        // onRefetch's parent already toasts on failure; nothing to do here.
      }
      // Bump the reseed counter so the effect picks up the next props snapshot.
      setForceReseed((n) => n + 1);
    },
    [onRefetch]
  );

  const toggleEnabled = useCallback(
    async (checked: boolean) => {
      const nextMode: PhaseSelectionMode = checked ? "ATTENDEE_PICKS" : "NONE";
      // Expansion is pure UI state — no network, no rollback needed.
      setExpanded(checked);
      await patchPhase(
        { selectionMode: nextMode },
        { selectionMode: nextMode }
      );
    },
    [patchPhase]
  );

  const changeMode = useCallback(
    (mode: PhaseSelectionMode) =>
      patchPhase({ selectionMode: mode }, { selectionMode: mode }),
    [patchPhase]
  );

  const setMaxSelections = useCallback(
    (n: number) =>
      patchPhase({ maxSelections: n }, { maxSelections: n }),
    [patchPhase]
  );
  const setAllowChange = useCallback(
    (b: boolean) =>
      patchPhase(
        { allowChangeAfterSubmit: b },
        { allowChangeAfterSubmit: b }
      ),
    [patchPhase]
  );
  const setRequiresReceiptUpload = useCallback(
    (b: boolean) =>
      patchPhase(
        { requiresReceiptUpload: b },
        { requiresReceiptUpload: b }
      ),
    [patchPhase]
  );

  // ─────────────────────────────────────────────────────────────────────
  // Option-level mutations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Run an option mutation behind that option's serialisation lock so
   * rapid commits (e.g., blur on label, then blur on description) apply
   * in order rather than racing.
   */
  const withOptionLock = useCallback(
    async <T,>(optionId: string, fn: () => Promise<T>): Promise<T> => {
      const prior = optionLocks.current.get(optionId);
      if (prior) await prior.catch(() => {});
      const next = fn();
      optionLocks.current.set(
        optionId,
        next.catch(() => {})
      );
      try {
        return await next;
      } finally {
        if (optionLocks.current.get(optionId) === next.catch(() => {})) {
          optionLocks.current.delete(optionId);
        }
      }
    },
    []
  );

  const subjectFor = useCallback((label: string) => `"${label}"`, []);

  const patchOption = useCallback(
    async (
      optionId: string,
      patch: Partial<PhaseOption>,
      optimistic: Partial<PhaseOption>
    ) => {
      return withOptionLock(optionId, async () => {
        // Snapshot for rollback. We re-read from latest state inside the
        // updater to avoid stale-closure bugs when patches queue up.
        let snapshot: PhaseOption | undefined;
        setLocalOptions((opts) => {
          const idx = opts.findIndex((o) => o.id === optionId);
          if (idx === -1) return opts;
          snapshot = opts[idx];
          const next = [...opts];
          next[idx] = { ...opts[idx], ...optimistic };
          return next;
        });
        if (!snapshot) return; // option vanished mid-flight (shouldn't happen)
        const subject = subjectFor(snapshot.label);

        setOptionPending(optionId, true);
        setOptionError(optionId, null);

        const result = await fetchJson<PhaseOption>(
          `/api/events/${eventId}/phases/${phase.id}/options/${optionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...patch,
              expectedUpdatedAt: snapshot.updatedAt,
            }),
          },
          subject
        );

        setOptionPending(optionId, false);

        if (result.ok) {
          // Server response wins. Preserve the locally-known _count since
          // the PATCH endpoint doesn't return it.
          setLocalOptions((opts) =>
            opts.map((o) =>
              o.id === optionId
                ? { ...result.data, _count: o._count }
                : o
            )
          );
          // Clear any previous error indicator for this row.
          setOptionError(optionId, null);
          return;
        }

        // Roll back to the pre-mutation snapshot.
        setLocalOptions((opts) =>
          opts.map((o) => (o.id === optionId ? snapshot! : o))
        );
        if (result.error.code === "OPTION_CONCURRENCY") {
          await handleConcurrencyConflict(result.error);
        } else {
          setOptionError(optionId, result.error.message);
          toast.error(result.error.message);
        }
      });
    },
    [
      eventId,
      phase.id,
      setOptionPending,
      setOptionError,
      withOptionLock,
      handleConcurrencyConflict,
      subjectFor,
    ]
  );

  const addOption = useCallback(async () => {
    // Optimistic placeholder with a temp id. While pending the row renders
    // muted; on success we swap the temp for the real server-assigned row.
    const tempId = `temp_${Math.random().toString(36).slice(2, 10)}`;
    const placeholder: PhaseOption = {
      id: tempId,
      label: `Option ${localOptions.length + 1}`,
      labelAr: null,
      description: null,
      descriptionAr: null,
      externalUrl: null,
      capacity: null,
      metadata: null,
      requiresReceipt: null,
      receiptLabel: null,
      receiptInstructions: null,
      receiptLabelAr: null,
      receiptInstructionsAr: null,
      isActive: true,
      order: localOptions.length,
      updatedAt: new Date().toISOString(),
      _count: { selections: 0 },
    };
    setLocalOptions((opts) => [...opts, placeholder]);
    setOptionPending(tempId, true);

    const result = await fetchJson<PhaseOption>(
      `/api/events/${eventId}/phases/${phase.id}/options`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: placeholder.label }),
      },
      "new option"
    );

    setOptionPending(tempId, false);

    if (result.ok) {
      // Replace the temp row with the server's row, preserving order index.
      setLocalOptions((opts) =>
        opts.map((o) =>
          o.id === tempId
            ? { ...result.data, _count: { selections: 0 } }
            : o
        )
      );
      setEditingOptionId(result.data.id);
    } else {
      // Remove placeholder on failure.
      setLocalOptions((opts) => opts.filter((o) => o.id !== tempId));
      toast.error(result.error.message);
    }
  }, [eventId, phase.id, localOptions.length, setOptionPending]);

  const reorderOption = useCallback(
    async (optionId: string, direction: "up" | "down") => {
      // Optimistic swap of two adjacent rows. Reorder doesn't carry a
      // concurrency token (the server's swap is idempotent for our purposes)
      // but rollback still applies on a hard failure.
      let snapshot: PhaseOption[] | null = null;
      setLocalOptions((opts) => {
        const idx = opts.findIndex((o) => o.id === optionId);
        if (idx === -1) return opts;
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= opts.length) return opts;
        snapshot = opts;
        const next = [...opts];
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        return next.map((o, i) => ({ ...o, order: i }));
      });
      if (!snapshot) return;

      setOptionPending(optionId, true);
      setOptionError(optionId, null);

      const result = await fetchJson<{ success: boolean }>(
        `/api/events/${eventId}/phases/${phase.id}/options/${optionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction }),
        },
        "option order"
      );

      setOptionPending(optionId, false);

      if (!result.ok) {
        setLocalOptions(snapshot);
        toast.error(result.error.message);
      }
    },
    [eventId, phase.id, setOptionError, setOptionPending]
  );

  const deleteOption = useCallback(
    async (optionId: string) => {
      const target = localOptions.find((o) => o.id === optionId);
      if (!target) return;
      const subject = subjectFor(target.label);

      // Optimistic remove. We snapshot the full list so we can restore the
      // row at its original index on failure.
      const snapshot = localOptions;
      setLocalOptions((opts) => opts.filter((o) => o.id !== optionId));
      setOptionPending(optionId, true);

      const result = await fetchJson<{ success: boolean }>(
        `/api/events/${eventId}/phases/${phase.id}/options/${optionId}`,
        { method: "DELETE" },
        subject
      );

      setOptionPending(optionId, false);

      if (!result.ok) {
        // Restore.
        setLocalOptions(snapshot);
        if (result.error.code === "OPTION_HAS_SELECTIONS") {
          // Open the deactivate-instead dialog rather than toast.
          setDeleteGuard({
            optionId,
            label: target.label,
            selectionCount: result.error.extras.selectionCount ?? 0,
          });
          return;
        }
        setOptionError(optionId, result.error.message);
        toast.error(result.error.message);
      }
    },
    [
      eventId,
      phase.id,
      localOptions,
      setOptionPending,
      setOptionError,
      subjectFor,
    ]
  );

  const deactivateOption = useCallback(
    async (optionId: string) => {
      setDeleteGuard(null);
      const target = localOptions.find((o) => o.id === optionId);
      if (!target) return;
      await patchOption(
        optionId,
        { isActive: false },
        { isActive: false }
      );
    },
    [localOptions, patchOption]
  );

  // ── Derived flags ──
  const enabled = localPhase.selectionMode !== "NONE";
  const showMaxSelections = MODES_WITH_MAX_SELECTIONS.includes(
    localPhase.selectionMode
  );

  // Local draft for the maxSelections input — we want responsive typing.
  const [maxSelectionsDraft, setMaxSelectionsDraft] = useState(
    String(localPhase.maxSelections)
  );
  useEffect(() => {
    setMaxSelectionsDraft(String(localPhase.maxSelections));
  }, [localPhase.maxSelections]);

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
                {SELECTION_MODE_LABELS[localPhase.selectionMode]}
              </Badge>
            )}
            {pendingPhase && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
            {errorPhase && !pendingPhase && (
              <AlertCircle
                className="h-3 w-3 text-destructive"
                aria-label={errorPhase}
              />
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
                value={localPhase.selectionMode}
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
                {SELECTION_MODE_DESCRIPTIONS[localPhase.selectionMode]}
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
                  onBlur={() => {
                    const n = parseInt(maxSelectionsDraft, 10);
                    if (!Number.isFinite(n) || n < 1) {
                      setMaxSelectionsDraft(String(localPhase.maxSelections));
                      return;
                    }
                    if (n !== localPhase.maxSelections) setMaxSelections(n);
                  }}
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
                checked={localPhase.allowChangeAfterSubmit}
                onCheckedChange={setAllowChange}
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
                checked={localPhase.requiresReceiptUpload}
                onCheckedChange={setRequiresReceiptUpload}
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

          {errorPhase && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p>{errorPhase}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6"
                onClick={() => setErrorPhase(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Options list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Options list</Label>
              <Button size="sm" variant="outline" onClick={addOption}>
                <Plus className="mr-2 h-4 w-4" /> Add option
              </Button>
            </div>

            {localOptions.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No options yet. Add one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {localOptions.map((option, idx) => (
                  <OptionRow
                    key={option.id}
                    option={option}
                    isFirst={idx === 0}
                    isLast={idx === localOptions.length - 1}
                    isEditing={editingOptionId === option.id}
                    isPending={pendingOptions.has(option.id)}
                    error={errorOptions[option.id] ?? null}
                    phaseRequiresReceipt={localPhase.requiresReceiptUpload}
                    multiLanguageEnabled={multiLanguageEnabled}
                    onToggleEdit={() =>
                      setEditingOptionId((current) =>
                        current === option.id ? null : option.id
                      )
                    }
                    onMove={(d) => reorderOption(option.id, d)}
                    onDelete={() => deleteOption(option.id)}
                    onClearError={() => setOptionError(option.id, null)}
                    onPatch={(patch, optimistic) =>
                      patchOption(option.id, patch, optimistic)
                    }
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

function extractPhaseState(phase: PhaseOptionsPanelData) {
  return {
    selectionMode: phase.selectionMode,
    maxSelections: phase.maxSelections,
    allowChangeAfterSubmit: phase.allowChangeAfterSubmit,
    requiresReceiptUpload: phase.requiresReceiptUpload,
    updatedAt: phase.updatedAt,
  };
}
