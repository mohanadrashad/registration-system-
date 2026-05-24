"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { MAPPING_ERROR_CODES } from "@/lib/validations/field-mapping";

// ─── Wire types (match the service exports) ───────────────────────

interface BackfillDiff {
  registrationId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  changes: Record<string, string>;
  previous: Record<string, string>;
}

interface BackfillPreview {
  willUpdate: number;
  alreadyCorrect: number;
  skipped: number;
  diffs: BackfillDiff[];
  diffsTruncated: boolean;
}

interface BackfillFailure {
  contactId: string;
  contactName: string;
  contactEmail: string;
  error: string;
}

interface BackfillRunResponse {
  updated: number;
  failed: BackfillFailure[];
  summary: {
    willUpdate: number;
    alreadyCorrect: number;
    skipped: number;
  };
  interruptedAtRow?: number;
}

type Phase = "preview" | "applying" | "result" | "stale";

interface StaleConflict {
  expectedWillUpdate: number;
  currentWillUpdate: number;
}

// ─── Top-level component ──────────────────────────────────────────

/**
 * Backfill dialog — single Radix Dialog with internal phase state
 * machine (preview → applying → result, or preview → stale →
 * preview-refresh). Mounted at the form-builder page root so it
 * stays alive across phase transitions and parent re-renders.
 *
 * Pattern mirrors src/components/attendee/quick-actions-card.tsx
 * (gold-standard non-racing dialog in this codebase):
 *   - Always-mounted at component root; visibility via `open` prop
 *   - `onOpenChange` blocked while `phase === "applying"`
 *   - Parent refetch deferred via setTimeout(0) per the
 *     radix-dialog-post-refetch-race lesson + maps-to-dropdown's
 *     deferRefetch pattern (Stage 1 Chunk 3)
 *
 * Toggle persistence: `overwriteNonEmpty` resets to false on each
 * fresh dialog open but PERSISTS across stale-recovery within a
 * single dialog session (a stale 409 returning the admin to the
 * preview view keeps their toggle choice intact).
 */
export function BackfillDialog({
  eventId,
  open,
  onOpenChange,
  onChanged,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>("preview");
  const [overwriteNonEmpty, setOverwriteNonEmpty] = useState(false);
  const [preview, setPreview] = useState<BackfillPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [result, setResult] = useState<BackfillRunResponse | null>(null);
  const [stale, setStale] = useState<StaleConflict | null>(null);

  // Fresh state + initial preview fetch on each open. State held
  // across opens would surprise admins (e.g. seeing last session's
  // toggle position); we always default to overwrite OFF.
  useEffect(() => {
    if (!open) return;
    setPhase("preview");
    setOverwriteNonEmpty(false);
    setPreview(null);
    setShowDetails(false);
    setResult(null);
    setStale(null);
    void fetchPreview(false);
    // fetchPreview is stable in this component (no closure deps that
    // matter); excluding it from deps avoids re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function fetchPreview(overwrite: boolean) {
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/field-mapping/backfill/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overwriteNonEmpty: overwrite }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to load preview");
        return;
      }
      const data: BackfillPreview = await res.json();
      setPreview(data);
    } catch {
      toast.error("Network error while loading preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleToggle(next: boolean) {
    setOverwriteNonEmpty(next);
    setShowDetails(false);
    void fetchPreview(next);
  }

  async function apply() {
    if (!preview) return;
    setPhase("applying");
    try {
      const res = await fetch(
        `/api/events/${eventId}/field-mapping/backfill/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overwriteNonEmpty,
            expectedWillUpdate: preview.willUpdate,
          }),
        }
      );
      // Single res.json() parse — the Response body stream can only
      // be consumed once. We branch on status + code afterwards from
      // the same parsed body, so a 409 with a non-stale code falls
      // through to the generic toast with the actual error message
      // intact (not swallowed by a second parse attempt on a
      // consumed stream).
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (
          res.status === 409 &&
          body?.code === MAPPING_ERROR_CODES.BACKFILL_PREVIEW_STALE
        ) {
          setStale({
            expectedWillUpdate: body.conflict.expectedWillUpdate,
            currentWillUpdate: body.conflict.currentWillUpdate,
          });
          setPhase("stale");
          return;
        }
        toast.error(body?.error ?? "Backfill failed");
        setPhase("preview");
        return;
      }
      const data: BackfillRunResponse = await res.json();
      setResult(data);
      setPhase("result");
    } catch {
      toast.error("Network error while running backfill");
      setPhase("preview");
    }
  }

  async function refreshFromStale() {
    setStale(null);
    setPhase("preview");
    // Toggle persists across stale-recovery per spec: refresh is a
    // recovery from 409, not a fresh start.
    await fetchPreview(overwriteNonEmpty);
  }

  function handleClose() {
    onOpenChange(false);
    // Defer refetch to next macrotask so Radix unmount completes
    // first. Same load-bearing setTimeout(0) pattern as
    // maps-to-dropdown's deferRefetch (Stage 1 Chunk 3) — prevents
    // the FocusScope DOMException class of bug from
    // radix-dialog-post-refetch-race.md.
    setTimeout(() => {
      void onChanged();
    }, 0);
  }

  async function copyError(failure: BackfillFailure) {
    const text = `${failure.contactName} — ${failure.contactEmail}\n${failure.error}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Error copied to clipboard");
    } catch {
      // Some enterprise setups deny clipboard access. Fall back to
      // surfacing the text in a long-lived toast so the admin can
      // manually select + copy.
      toast.warning("Copy failed — error text below (select and copy manually)", {
        description: text,
        duration: 15000,
      });
    }
  }

  function handleOpenChange(next: boolean) {
    if (phase === "applying") return; // can't close mid-apply
    if (!next) {
      handleClose();
    } else {
      onOpenChange(next);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        {phase === "preview" && (
          <PreviewView
            preview={preview}
            previewLoading={previewLoading}
            overwriteNonEmpty={overwriteNonEmpty}
            onToggle={handleToggle}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((v) => !v)}
            onCancel={handleClose}
            onApply={apply}
          />
        )}
        {phase === "applying" && <ApplyingView preview={preview} />}
        {phase === "result" && result && (
          <ResultView
            result={result}
            onCopyError={copyError}
            onClose={handleClose}
          />
        )}
        {phase === "stale" && stale && (
          <StaleView
            stale={stale}
            refreshing={previewLoading}
            onCancel={handleClose}
            onRefresh={refreshFromStale}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Preview view ─────────────────────────────────────────────────

function PreviewView({
  preview,
  previewLoading,
  overwriteNonEmpty,
  onToggle,
  showDetails,
  onToggleDetails,
  onCancel,
  onApply,
}: {
  preview: BackfillPreview | null;
  previewLoading: boolean;
  overwriteNonEmpty: boolean;
  onToggle: (next: boolean) => void;
  showDetails: boolean;
  onToggleDetails: () => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  // Gate the empty-state banner on !previewLoading so the toggle
  // re-fetch transition doesn't briefly flash the "Nothing to update"
  // banner against the stale willUpdate=0 from the prior fetch.
  // Banner disappears during re-fetch, reappears only if the fresh
  // count is also 0.
  const isEmpty =
    preview !== null && !previewLoading && preview.willUpdate === 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Apply to existing registrations</DialogTitle>
        <DialogDescription>
          Re-runs the field mapping against every existing registration on
          this event and updates Contact rows where the resolved value
          differs.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Bucket summary */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          {preview === null ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading preview…
            </div>
          ) : (
            <div className="space-y-1">
              <BucketRow
                label="Will update"
                count={preview.willUpdate}
                emphasis
              />
              <BucketRow
                label="Already correct"
                count={preview.alreadyCorrect}
              />
              <BucketRow
                label="Skipped"
                count={preview.skipped}
                trailing="(no resolvable value or blocked by overwrite)"
              />
            </div>
          )}
        </div>

        {/* Overwrite toggle */}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Switch
            id="backfill-overwrite-toggle"
            checked={overwriteNonEmpty}
            onCheckedChange={onToggle}
            disabled={previewLoading}
          />
          <div className="flex-1 space-y-1">
            <Label
              htmlFor="backfill-overwrite-toggle"
              className="text-sm font-medium cursor-pointer flex items-center gap-2"
            >
              Overwrite non-empty Contact values
              {previewLoading && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </Label>
            <p className="text-xs text-muted-foreground">
              Off by default — only fills empty columns. Synthetic emails are
              always replaced by resolved real emails regardless of toggle.
            </p>
          </div>
        </div>

        {/* Empty-state OR show-details expander */}
        {isEmpty ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
            <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-emerald-900">
              Nothing to update — {preview!.alreadyCorrect}{" "}
              {preview!.alreadyCorrect === 1 ? "contact is" : "contacts are"}{" "}
              already correct.
            </p>
          </div>
        ) : preview && preview.willUpdate > 0 ? (
          <div>
            <button
              type="button"
              onClick={onToggleDetails}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {showDetails ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Show details ({preview.willUpdate} row
              {preview.willUpdate === 1 ? "" : "s"})
            </button>
            {showDetails && <DiffList preview={preview} />}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        {isEmpty ? (
          <Button variant="outline" onClick={onCancel}>
            Close
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={previewLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={onApply}
              disabled={
                previewLoading || preview === null || preview.willUpdate === 0
              }
            >
              {preview
                ? `Apply to ${preview.willUpdate} row${
                    preview.willUpdate === 1 ? "" : "s"
                  }`
                : "Apply"}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

function BucketRow({
  label,
  count,
  emphasis,
  trailing,
}: {
  label: string;
  count: number;
  emphasis?: boolean;
  trailing?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={`w-32 shrink-0 ${
          emphasis ? "font-medium" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <span className={emphasis ? "font-semibold" : ""}>{count}</span>
      <span className="text-muted-foreground">
        {count === 1 ? "contact" : "contacts"}
      </span>
      {trailing && (
        <span className="text-xs text-muted-foreground ml-1">{trailing}</span>
      )}
    </div>
  );
}

function DiffList({ preview }: { preview: BackfillPreview }) {
  return (
    <div className="mt-2 max-h-96 overflow-y-auto rounded-md border divide-y">
      {preview.diffs.map((diff) => (
        <div key={diff.registrationId} className="p-3 text-sm space-y-1">
          <div className="font-medium">
            {diff.contactName}
            <span className="font-normal text-muted-foreground ml-2">
              — {diff.contactEmail}
            </span>
          </div>
          <div className="pl-2 space-y-0.5">
            {Object.entries(diff.changes).map(([col, to]) => (
              <div key={col} className="text-xs font-mono">
                <span className="text-muted-foreground">{col}:</span>{" "}
                <span className="text-muted-foreground">
                  &quot;{diff.previous[col] ?? ""}&quot;
                </span>{" "}
                →{" "}
                <span className="text-foreground">&quot;{to}&quot;</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {preview.diffsTruncated && (
        <div className="p-3 text-xs text-muted-foreground italic">
          ... and more rows (apply to see all)
        </div>
      )}
    </div>
  );
}

// ─── Applying view ────────────────────────────────────────────────

function ApplyingView({ preview }: { preview: BackfillPreview | null }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Applying backfill…</DialogTitle>
      </DialogHeader>
      <div className="flex items-center gap-3 py-4 text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span>
          Updating {preview?.willUpdate ?? 0} contact
          {preview?.willUpdate === 1 ? "" : "s"}. Don&apos;t close this
          dialog.
        </span>
      </div>
    </>
  );
}

// ─── Result view ──────────────────────────────────────────────────

function ResultView({
  result,
  onCopyError,
  onClose,
}: {
  result: BackfillRunResponse;
  onCopyError: (failure: BackfillFailure) => void;
  onClose: () => void;
}) {
  const hasFailures = result.failed.length > 0;
  const wasInterrupted = result.interruptedAtRow !== undefined;
  const title = wasInterrupted
    ? "Backfill interrupted"
    : hasFailures
    ? "Backfill partially complete"
    : "Backfill complete";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {wasInterrupted && (
          <div className="flex items-start gap-2 rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-900">
                Interrupted at row {result.interruptedAtRow}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                The backfill stopped before completing all rows. Re-run to
                attempt the remaining rows.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            <span>
              Updated <strong>{result.updated}</strong>{" "}
              {result.updated === 1 ? "contact" : "contacts"}
            </span>
          </div>
          {hasFailures && (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span>
                Failed <strong>{result.failed.length}</strong>{" "}
                {result.failed.length === 1 ? "contact" : "contacts"}
              </span>
            </div>
          )}
        </div>

        {hasFailures && (
          <div>
            <p className="text-sm font-medium mb-2">Failures:</p>
            <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
              {result.failed.map((failure) => (
                <div
                  key={failure.contactId}
                  className="p-3 text-sm space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {failure.contactName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {failure.contactEmail}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => onCopyError(failure)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <div className="text-xs font-mono text-destructive bg-destructive/5 rounded p-2">
                    {failure.error}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}

// ─── Stale view ───────────────────────────────────────────────────

function StaleView({
  stale,
  refreshing,
  onCancel,
  onRefresh,
}: {
  stale: StaleConflict;
  refreshing: boolean;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Preview is stale</DialogTitle>
      </DialogHeader>
      <div className="flex items-start gap-2 rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-amber-900">
          The data changed while you were reviewing. Expected{" "}
          <strong>{stale.expectedWillUpdate}</strong> row
          {stale.expectedWillUpdate === 1 ? "" : "s"} to update; now{" "}
          <strong>{stale.currentWillUpdate}</strong> row
          {stale.currentWillUpdate === 1 ? "" : "s"} need updating. Refresh
          to see what&apos;s different before applying.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={refreshing}>
          Cancel
        </Button>
        <Button onClick={onRefresh} disabled={refreshing}>
          {refreshing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Refresh preview
        </Button>
      </DialogFooter>
    </>
  );
}
