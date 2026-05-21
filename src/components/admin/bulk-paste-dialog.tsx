"use client";

/**
 * <BulkPasteDialog>
 *
 * Modal for adding many options to a FormField in one paste. Two formats
 * (auto-detected from the paste content, admin can override):
 *
 *   • Single language (one item per line) — admin picks EN or AR; an
 *     optional "Translate all" button runs every entry through
 *     /api/translate so the other side is populated.
 *   • Bilingual (EN | AR  or  EN<tab>AR per line) — separator detected
 *     from the first matching line on paste.
 *
 * The preview table is inline-editable. Each row gets a status:
 *   ✓ Ready          — both sides present.
 *   ⚠ Needs AR/EN    — one side empty (still committable; admin saw the
 *                      warning).
 *   ⚠ Low confidence — translation finished but MyMemory's match score is
 *                      below the threshold (still committable).
 *   ✗ Parse error    — bilingual line didn't split into exactly 2 cells.
 *                      Excluded from the commit count.
 *
 * Commit calls `onCommit(items)` with shape
 *   { labelEn: string; labelAr: string | null; value: string }
 * The caller is responsible for collision-resolution against existing
 * FormField.options values (we slugify each English label and resolve
 * collisions among the new batch only; the caller resolves against the
 * existing array using `slugifyAndResolve(labels, existingValues)`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugifyOptionValue } from "@/lib/form-builder/option-value";
import type { TranslateResult } from "@/lib/services/translation.service";

export interface BulkPasteItem {
  labelEn: string;
  labelAr: string | null;
  /** Slugified from labelEn (no collision-resolution against the caller's
   *  existing options here — the caller does that). */
  value: string;
}

export interface BulkPasteDialogProps {
  open: boolean;
  onClose: () => void;
  onCommit: (items: BulkPasteItem[]) => void;
  /** Used to compose the empty-state hint and the "Add N items" label. */
  title?: string;
}

type Mode = "single" | "bilingual";
type SingleLang = "en" | "ar";

interface PreviewRow {
  /** Stable client id, used as React key while editing. */
  id: string;
  labelEn: string;
  labelAr: string;
  /** Set on parse-error rows. Holds the raw line so admins can see what
   *  went wrong. When parseError is set, labelEn/labelAr are empty. */
  parseError: string | null;
  /** Set to true while this specific row is being translated (single-mode
   *  "Translate all" updates them in place). */
  pending: boolean;
  /** Updated after a translation completes. Drives the "Low conf" status
   *  when the auto-fill came back below threshold. */
  lowConfidenceSide: "en" | "ar" | null;
}

type RowStatus =
  | "ready"
  | "needs_ar"
  | "needs_en"
  | "low_confidence"
  | "parse_error"
  | "pending";

function rowStatus(row: PreviewRow): RowStatus {
  if (row.parseError) return "parse_error";
  if (row.pending) return "pending";
  if (row.lowConfidenceSide) return "low_confidence";
  if (!row.labelEn.trim()) return "needs_en";
  if (!row.labelAr.trim()) return "needs_ar";
  return "ready";
}

// Status → addable. Parse-error rows excluded; everything else counts.
function isAddable(status: RowStatus): boolean {
  return status !== "parse_error" && status !== "pending";
}

let rowIdCounter = 0;
function makeRowId(): string {
  rowIdCounter += 1;
  return `row-${rowIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Detect whether the pasted text looks bilingual. Picks the first
 *  separator that appears on any non-empty line; tab takes precedence
 *  over pipe (matches what tools like Excel emit on copy). Returns
 *  null when no separator is detected. */
function detectSeparator(text: string): "|" | "\t" | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (line.includes("\t")) return "\t";
    if (line.includes("|")) return "|";
  }
  return null;
}

function parseLines(
  text: string,
  mode: Mode,
  singleLang: SingleLang,
  separator: "|" | "\t" | null
): PreviewRow[] {
  const lines = text.split(/\r?\n/);
  const rows: PreviewRow[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (mode === "bilingual") {
      const sep = separator ?? (line.includes("\t") ? "\t" : "|");
      const parts = line.split(sep);
      if (parts.length !== 2) {
        rows.push({
          id: makeRowId(),
          labelEn: "",
          labelAr: "",
          parseError: rawLine,
          pending: false,
          lowConfidenceSide: null,
        });
        continue;
      }
      rows.push({
        id: makeRowId(),
        labelEn: parts[0].trim(),
        labelAr: parts[1].trim(),
        parseError: null,
        pending: false,
        lowConfidenceSide: null,
      });
    } else {
      if (singleLang === "en") {
        rows.push({
          id: makeRowId(),
          labelEn: line,
          labelAr: "",
          parseError: null,
          pending: false,
          lowConfidenceSide: null,
        });
      } else {
        rows.push({
          id: makeRowId(),
          labelEn: "",
          labelAr: line,
          parseError: null,
          pending: false,
          lowConfidenceSide: null,
        });
      }
    }
  }

  return rows;
}

export function BulkPasteDialog({
  open,
  onClose,
  onCommit,
  title = "Bulk add options",
}: BulkPasteDialogProps) {
  const [pastedText, setPastedText] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [singleLang, setSingleLang] = useState<SingleLang>("en");
  const [separator, setSeparator] = useState<"|" | "\t" | null>(null);
  /** True once the admin has manually flipped the mode radio. We stop
   *  auto-detecting on subsequent pastes so admin choice sticks. */
  const [modeOverridden, setModeOverridden] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [translateBusy, setTranslateBusy] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  // Reset everything when the dialog closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setPastedText("");
      setMode("single");
      setSingleLang("en");
      setSeparator(null);
      setModeOverridden(false);
      setRows([]);
      setTranslateBusy(false);
      setTopError(null);
    }
  }, [open]);

  // Auto-detect mode on every paste change, unless admin has overridden.
  // Re-parses rows whenever inputs change.
  useEffect(() => {
    if (!open) return;
    const detected = detectSeparator(pastedText);
    let effectiveMode = mode;
    let effectiveSep = separator;
    if (!modeOverridden) {
      if (detected) {
        effectiveMode = "bilingual";
        effectiveSep = detected;
      } else {
        effectiveMode = "single";
        effectiveSep = null;
      }
      if (effectiveMode !== mode) setMode(effectiveMode);
      if (effectiveSep !== separator) setSeparator(effectiveSep);
    }
    setRows(parseLines(pastedText, effectiveMode, singleLang, effectiveSep));
    // The mode/separator setters above intentionally re-trigger this hook;
    // the next pass produces the same rows so it stabilizes in 1 extra
    // render. Cheaper than threading a derived state.
  }, [pastedText, modeOverridden, singleLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = useCallback(
    (id: string, patch: Partial<Pick<PreviewRow, "labelEn" | "labelAr">>) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...patch };
          // Editing dismisses the low-confidence warning if the admin
          // touched the auto-filled side.
          if (
            r.lowConfidenceSide === "en" &&
            patch.labelEn !== undefined &&
            patch.labelEn !== r.labelEn
          ) {
            next.lowConfidenceSide = null;
          }
          if (
            r.lowConfidenceSide === "ar" &&
            patch.labelAr !== undefined &&
            patch.labelAr !== r.labelAr
          ) {
            next.lowConfidenceSide = null;
          }
          return next;
        })
      );
    },
    []
  );

  const deleteRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleModeChange = useCallback(
    (next: Mode) => {
      setMode(next);
      setModeOverridden(true);
      const detected = detectSeparator(pastedText);
      const sep = next === "bilingual" ? detected ?? "|" : null;
      setSeparator(sep);
      setRows(parseLines(pastedText, next, singleLang, sep));
    },
    [pastedText, singleLang]
  );

  const handleSingleLangChange = useCallback(
    (next: SingleLang) => {
      setSingleLang(next);
      // Re-parse so empty cells swap sides if admin flipped the language
      // mid-stream.
      setRows(parseLines(pastedText, mode, next, separator));
    },
    [pastedText, mode, separator]
  );

  // Translate all (single-language mode only). Targets only rows where
  // the destination side is currently empty; that way re-clicking after
  // editing some translations manually doesn't overwrite them.
  const handleTranslateAll = useCallback(async () => {
    if (mode !== "single") return;
    const sourceLang = singleLang;
    const targetLang: SingleLang = singleLang === "en" ? "ar" : "en";

    // Build list of rows that need translation. Skip parse errors and
    // rows that already have the target side filled.
    const targets = rows.filter((r) => {
      if (r.parseError) return false;
      if (sourceLang === "en") {
        return r.labelEn.trim() !== "" && r.labelAr.trim() === "";
      }
      return r.labelAr.trim() !== "" && r.labelEn.trim() === "";
    });

    if (targets.length === 0) {
      setTopError(null);
      return;
    }

    const sources = targets.map((r) =>
      sourceLang === "en" ? r.labelEn : r.labelAr
    );

    setTranslateBusy(true);
    setTopError(null);
    setRows((prev) =>
      prev.map((r) =>
        targets.some((t) => t.id === r.id) ? { ...r, pending: true } : r
      )
    );

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strings: sources,
          from: sourceLang,
          to: targetLang,
        }),
      });

      if (!res.ok) {
        let message = `Translation failed (HTTP ${res.status})`;
        if (res.status === 429) {
          message =
            "Too many translation requests. Please wait a moment and try again.";
        } else {
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            // ignore
          }
        }
        setTopError(message);
        setRows((prev) => prev.map((r) => ({ ...r, pending: false })));
        return;
      }

      const data = (await res.json()) as { results?: TranslateResult[] };
      const results = data.results ?? [];

      setRows((prev) =>
        prev.map((r) => {
          const idx = targets.findIndex((t) => t.id === r.id);
          if (idx === -1) return r;
          const result = results[idx];
          if (!result || result.status === "error") {
            // Translation failed for this specific string — leave it
            // empty, clear pending, no low-confidence flag.
            return { ...r, pending: false };
          }
          const isLowConf = result.status === "low_confidence";
          if (targetLang === "ar") {
            return {
              ...r,
              labelAr: result.translatedText,
              pending: false,
              lowConfidenceSide: isLowConf ? "ar" : null,
            };
          }
          return {
            ...r,
            labelEn: result.translatedText,
            pending: false,
            lowConfidenceSide: isLowConf ? "en" : null,
          };
        })
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Translation request failed";
      setTopError(message);
      setRows((prev) => prev.map((r) => ({ ...r, pending: false })));
    } finally {
      setTranslateBusy(false);
    }
  }, [mode, singleLang, rows]);

  const handleCommit = useCallback(() => {
    const items: BulkPasteItem[] = [];
    for (const r of rows) {
      if (r.parseError) continue;
      if (r.pending) continue;
      const labelEn = r.labelEn.trim();
      const labelAr = r.labelAr.trim();
      if (labelEn === "" && labelAr === "") continue;
      // Slug from EN; if EN is empty, slugifyOptionValue falls back to
      // "option" — caller's collision-resolver will turn it into
      // option_2, option_3, … so AR-only batches still get unique values.
      const value = slugifyOptionValue(labelEn);
      items.push({
        labelEn,
        labelAr: labelAr === "" ? null : labelAr,
        value,
      });
    }
    onCommit(items);
    onClose();
  }, [rows, onCommit, onClose]);

  const addableCount = useMemo(
    () => rows.filter((r) => isAddable(rowStatus(r))).length,
    [rows]
  );
  const parseErrorCount = useMemo(
    () => rows.filter((r) => r.parseError !== null).length,
    [rows]
  );
  const hasTranslatable = useMemo(() => {
    if (mode !== "single") return false;
    return rows.some((r) => {
      if (r.parseError) return false;
      if (singleLang === "en") {
        return r.labelEn.trim() !== "" && r.labelAr.trim() === "";
      }
      return r.labelAr.trim() !== "" && r.labelEn.trim() === "";
    });
  }, [rows, mode, singleLang]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Cap the dialog height and flex-stack header / scroll-body /
          sticky-footer so a 20-row preview can't push the action buttons
          out of the viewport. shadcn's DialogContent defaults to grid with
          p-6; we move the padding into each region so the scrollbar lines
          up with the dialog's right edge. */}
      <DialogContent className="sm:max-w-2xl flex flex-col gap-0 p-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste a list. Auto-detects single-language vs bilingual format.
            Bilingual lines are split on <code>|</code> or a tab character.
          </p>

          {/* Format selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => handleModeChange(v as Mode)}
              className="space-y-2"
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value="single" id="bp-mode-single" />
                <Label htmlFor="bp-mode-single" className="font-normal">
                  Single language (one item per line)
                </Label>
                {mode === "single" && (
                  <div className="ml-2 flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">
                      Language:
                    </Label>
                    <Select
                      value={singleLang}
                      onValueChange={(v) =>
                        handleSingleLangChange(v as SingleLang)
                      }
                    >
                      <SelectTrigger className="h-7 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ar">Arabic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="bilingual" id="bp-mode-bilingual" />
                <Label htmlFor="bp-mode-bilingual" className="font-normal">
                  Bilingual (EN | AR or EN&lt;tab&gt;AR per line)
                </Label>
              </div>
            </RadioGroup>
            {!modeOverridden && pastedText.trim() !== "" && (
              <p className="text-xs text-muted-foreground">
                {mode === "bilingual"
                  ? `Auto-detected from paste (separator: ${
                      separator === "\t" ? "tab" : "|"
                    }). Switch above if wrong.`
                  : "Auto-detected as single-language. Switch above if wrong."}
              </p>
            )}
          </div>

          {/* Paste textarea */}
          <div className="space-y-2">
            <Label htmlFor="bp-paste-area" className="text-sm font-medium">
              Paste your list
            </Label>
            <Textarea
              id="bp-paste-area"
              rows={6}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={
                mode === "bilingual"
                  ? "Cosmetics | مستحضرات تجميل\nBooks | الكتب\n…"
                  : singleLang === "en"
                  ? "Cosmetics\nBooks\nPlants\n…"
                  : "مستحضرات تجميل\nالكتب\nنباتات\n…"
              }
              className="font-mono text-sm"
            />
          </div>

          {/* Translate all (single-mode only) */}
          {mode === "single" && hasTranslatable && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTranslateAll}
                disabled={translateBusy}
              >
                {translateBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                )}
                {translateBusy
                  ? "Translating…"
                  : `Translate all to ${
                      singleLang === "en" ? "Arabic" : "English"
                    }`}
              </Button>
            </div>
          )}

          {topError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Translation failed: {topError}. You can still add items and fill
              the remaining translations manually.
            </div>
          )}

          {/* Preview */}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No items yet — paste content above to see a preview.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Preview — {addableCount}{" "}
                  {addableCount === 1 ? "item" : "items"} ready to add
                </Label>
                {parseErrorCount > 0 && (
                  <span className="text-xs text-destructive">
                    {parseErrorCount} parse{" "}
                    {parseErrorCount === 1 ? "error" : "errors"} excluded
                  </span>
                )}
              </div>
              {/* No inner overflow — the dialog body itself scrolls, so the
                  table's sticky thead pins to that scroll context. Avoids
                  nested-scroll confusion when previewing 20+ rows. */}
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground sticky top-0 z-10">
                    <tr>
                      <th className="w-8 px-2 py-1.5"></th>
                      <th className="px-2 py-1.5 text-left">English</th>
                      <th className="px-2 py-1.5 text-left">Arabic</th>
                      <th className="px-2 py-1.5 text-left">Value (auto)</th>
                      <th className="px-2 py-1.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const status = rowStatus(row);
                      const isError = status === "parse_error";
                      return (
                        <tr
                          key={row.id}
                          className={
                            isError
                              ? "border-t bg-destructive/5"
                              : "border-t hover:bg-muted/20"
                          }
                        >
                          <td className="px-2 py-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => deleteRow(row.id)}
                              aria-label="Remove row"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                          {isError ? (
                            <td
                              colSpan={3}
                              className="px-2 py-1 font-mono text-xs text-destructive"
                            >
                              {row.parseError}
                            </td>
                          ) : (
                            <>
                              <td className="px-2 py-1">
                                <Input
                                  value={row.labelEn}
                                  onChange={(e) =>
                                    updateRow(row.id, {
                                      labelEn: e.target.value,
                                    })
                                  }
                                  className="h-7 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  dir="rtl"
                                  value={row.labelAr}
                                  onChange={(e) =>
                                    updateRow(row.id, {
                                      labelAr: e.target.value,
                                    })
                                  }
                                  className="h-7 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1 font-mono text-xs text-muted-foreground">
                                {slugifyOptionValue(row.labelEn)}
                              </td>
                            </>
                          )}
                          <td className="px-2 py-1 text-xs whitespace-nowrap">
                            <StatusBadge status={status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:items-center">
          {addableCount > 5 && (
            <span className="text-xs text-muted-foreground sm:mr-auto">
              {addableCount} items ready · scroll to review
            </span>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCommit}
            disabled={addableCount === 0 || translateBusy}
          >
            Add {addableCount} {addableCount === 1 ? "item" : "items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  switch (status) {
    case "ready":
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" /> Ready
        </span>
      );
    case "needs_ar":
      return (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5" /> Needs AR
        </span>
      );
    case "needs_en":
      return (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5" /> Needs EN
        </span>
      );
    case "low_confidence":
      return (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5" /> Low conf
        </span>
      );
    case "parse_error":
      return (
        <span className="inline-flex items-center gap-1 text-destructive">
          <XCircle className="h-3.5 w-3.5" /> Parse error
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Translating…
        </span>
      );
  }
}
