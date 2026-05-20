"use client";

/**
 * <OptionsEditor>
 *
 * Editable list of FormField options. Used in both the Add Field and Edit
 * Field dialogs in the form-builder. Replaces the previous read-only
 * display rows with:
 *
 *   • A row per option that's collapsed by default (one-line summary) and
 *     expands into a BilingualInput on edit.
 *   • Reorder via ChevronUp/ChevronDown (matches the FormField list).
 *   • An "Add new option" affordance — single English input + Enter / +.
 *   • A "Bulk add" button that opens the BulkPasteDialog. New rows
 *     committed from bulk-paste are appended; their values are slugified
 *     and collision-resolved against the current array.
 *
 * Newly added rows (whether from "+ Add" or bulk-paste) start expanded so
 * the admin can immediately translate, refine, or correct them. Pre-
 * existing options loaded from the API start collapsed — critical for
 * fields with 20+ options where everything-expanded would overwhelm.
 *
 * The component owns one piece of derived state (per-row React keys +
 * expanded flags) but never mutates the outer options array directly:
 * every change goes through `onChange(nextOptions)` so the parent's save
 * flow stays unchanged.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BilingualInput } from "@/components/admin/bilingual-input";
import {
  BulkPasteDialog,
  type BulkPasteItem,
} from "@/components/admin/bulk-paste-dialog";
import {
  resolveValueCollision,
  slugifyOptionValue,
} from "@/lib/form-builder/option-value";

export interface FieldOption {
  value: string;
  label: string;
  labelAr?: string;
}

interface InternalRow {
  /** Stable client id used for the React key and the expanded-set entry. */
  key: string;
  option: FieldOption;
  expanded: boolean;
  /** True for rows the admin added in this session — we treat their EN
   *  label as "still being authored," which means typing into the label
   *  re-slugifies the value. False (the default) for rows loaded from
   *  the API: their stored value is preserved verbatim even if the EN
   *  label is edited, so legacy custom values don't silently mutate.
   *
   *  When the admin DOES edit a loaded row's label, we flip this true on
   *  first keystroke so subsequent edits stay coherent (label and value
   *  track together for the rest of the session). The value-lock guard
   *  on the API side handles the case where this re-slug breaks an
   *  in-use option. */
  trackSlug: boolean;
}

let rowKeyCounter = 0;
function makeRowKey(): string {
  rowKeyCounter += 1;
  return `opt-${rowKeyCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildInitialRows(options: FieldOption[]): InternalRow[] {
  return options.map((option) => ({
    key: makeRowKey(),
    option,
    expanded: false,
    trackSlug: false,
  }));
}

export interface OptionsEditorProps {
  options: FieldOption[];
  onChange: (next: FieldOption[]) => void;
}

export function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const [rows, setRows] = useState<InternalRow[]>(() =>
    buildInitialRows(options)
  );
  const [addLabel, setAddLabel] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  // External → internal reconciliation. Only rebuild when the external
  // array's shape diverges from what we have (count differs, or any
  // entry's value/label/labelAr differs at the same index). This covers
  // the parent reloading after a save without clobbering in-flight
  // edits, while also keeping the initial mount tidy.
  const lastSyncedRef = useRef(options);
  useEffect(() => {
    if (options === lastSyncedRef.current) return;
    lastSyncedRef.current = options;
    const sameShape =
      options.length === rows.length &&
      options.every((o, i) => {
        const r = rows[i]?.option;
        return (
          r &&
          r.value === o.value &&
          r.label === o.label &&
          (r.labelAr ?? null) === (o.labelAr ?? null)
        );
      });
    if (!sameShape) setRows(buildInitialRows(options));
    // We don't include `rows` in deps because we read it imperatively
    // for the shape check; reacting on rows would re-trigger after our
    // own setRows above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const emit = useCallback(
    (next: InternalRow[]) => {
      setRows(next);
      onChange(next.map((r) => r.option));
    },
    [onChange]
  );

  const setRow = useCallback(
    (key: string, mut: (row: InternalRow) => InternalRow) => {
      emit(rows.map((r) => (r.key === key ? mut(r) : r)));
    },
    [rows, emit]
  );

  const toggleExpand = useCallback(
    (key: string) => {
      setRow(key, (r) => ({ ...r, expanded: !r.expanded }));
    },
    [setRow]
  );

  const moveUp = useCallback(
    (key: string) => {
      const idx = rows.findIndex((r) => r.key === key);
      if (idx <= 0) return;
      const next = [...rows];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      emit(next);
    },
    [rows, emit]
  );

  const moveDown = useCallback(
    (key: string) => {
      const idx = rows.findIndex((r) => r.key === key);
      if (idx === -1 || idx >= rows.length - 1) return;
      const next = [...rows];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      emit(next);
    },
    [rows, emit]
  );

  const removeRow = useCallback(
    (key: string) => {
      emit(rows.filter((r) => r.key !== key));
    },
    [rows, emit]
  );

  const updateLabel = useCallback(
    (key: string, label: string) => {
      setRow(key, (r) => {
        // Compute new value:
        //   • If the row is tracking the slug (new row OR previously-
        //     loaded row whose label has been edited in this session),
        //     re-slug from the new label and resolve collisions against
        //     the OTHER rows.
        //   • If it's not tracking, leave the value alone — preserves
        //     legacy custom values on first touch.
        let nextValue = r.option.value;
        const nextTrack = r.trackSlug || label !== r.option.label;
        if (nextTrack) {
          const others = new Set(
            rows.filter((x) => x.key !== r.key).map((x) => x.option.value)
          );
          const base = slugifyOptionValue(label);
          nextValue = resolveValueCollision(base, others);
        }
        return {
          ...r,
          option: { ...r.option, label, value: nextValue },
          trackSlug: nextTrack,
        };
      });
    },
    [rows, setRow]
  );

  const updateLabelAr = useCallback(
    (key: string, labelAr: string) => {
      setRow(key, (r) => ({
        ...r,
        option: {
          ...r.option,
          labelAr: labelAr === "" ? undefined : labelAr,
        },
      }));
    },
    [setRow]
  );

  const handleAdd = useCallback(() => {
    const trimmed = addLabel.trim();
    if (trimmed === "") return;
    const existing = new Set(rows.map((r) => r.option.value));
    const value = resolveValueCollision(slugifyOptionValue(trimmed), existing);
    const newRow: InternalRow = {
      key: makeRowKey(),
      option: { value, label: trimmed },
      expanded: true,
      trackSlug: true,
    };
    emit([...rows, newRow]);
    setAddLabel("");
  }, [addLabel, rows, emit]);

  const handleBulkCommit = useCallback(
    (items: BulkPasteItem[]) => {
      const existing = new Set(rows.map((r) => r.option.value));
      const newRows: InternalRow[] = [];
      for (const item of items) {
        // BulkPasteDialog already slugified labelEn for us; we just need
        // to resolve collisions against the OUR existing values plus the
        // batch's own previous entries.
        const base = item.value || slugifyOptionValue(item.labelEn);
        const value = resolveValueCollision(base, existing);
        existing.add(value);
        newRows.push({
          key: makeRowKey(),
          option: {
            value,
            label: item.labelEn,
            ...(item.labelAr ? { labelAr: item.labelAr } : {}),
          },
          // Newly added rows start expanded — admin can immediately
          // tweak, retranslate, etc.
          expanded: true,
          trackSlug: true,
        });
      }
      emit([...rows, ...newRows]);
    },
    [rows, emit]
  );

  const totalRows = rows.length;

  return (
    <div className="space-y-3">
      {/* Option rows */}
      {totalRows > 0 && (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <OptionRow
              key={row.key}
              row={row}
              isFirst={idx === 0}
              isLast={idx === totalRows - 1}
              onToggleExpand={() => toggleExpand(row.key)}
              onMoveUp={() => moveUp(row.key)}
              onMoveDown={() => moveDown(row.key)}
              onRemove={() => removeRow(row.key)}
              onChangeLabel={(v) => updateLabel(row.key, v)}
              onChangeLabelAr={(v) => updateLabelAr(row.key, v)}
            />
          ))}
        </div>
      )}

      {/* Add new option */}
      <div className="flex gap-2">
        <Input
          placeholder="Type option label and press Enter or +"
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAdd}
          disabled={addLabel.trim() === ""}
          aria-label="Add option"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Bulk add */}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setBulkOpen(true)}
        >
          <Upload className="mr-2 h-4 w-4" />
          Bulk add
        </Button>
      </div>

      <BulkPasteDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onCommit={handleBulkCommit}
      />
    </div>
  );
}

interface OptionRowProps {
  row: InternalRow;
  isFirst: boolean;
  isLast: boolean;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChangeLabel: (next: string) => void;
  onChangeLabelAr: (next: string) => void;
}

function OptionRow({
  row,
  isFirst,
  isLast,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChangeLabel,
  onChangeLabelAr,
}: OptionRowProps) {
  const { option, expanded } = row;
  const arDisplay = option.labelAr?.trim();

  return (
    <div className="rounded-md border bg-background">
      {expanded ? (
        <div className="space-y-2 p-3">
          <div className="flex gap-2">
            {/* Reorder column */}
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMoveUp}
                disabled={isFirst}
                aria-label="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMoveDown}
                disabled={isLast}
                aria-label="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            {/* Main content */}
            <div className="flex-1 min-w-0">
              <BilingualInput
                label="Label"
                idPrefix={`opt-${row.key}`}
                valueEn={option.label}
                valueAr={option.labelAr ?? ""}
                onChangeEn={onChangeLabel}
                onChangeAr={onChangeLabelAr}
              />
              <div className="mt-2 font-mono text-xs text-muted-foreground">
                value: {option.value}
              </div>
            </div>
            {/* Right column: collapse + delete */}
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onToggleExpand}
                aria-label="Collapse"
              >
                <XIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onRemove}
                aria-label="Delete option"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Collapsed summary row. Clicking anywhere except the buttons
        // expands.
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            // Don't toggle when clicking an action button — those have
            // their own handlers that stopPropagation below.
            if (
              e.target instanceof HTMLElement &&
              e.target.closest("button")
            ) {
              return;
            }
            onToggleExpand();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleExpand();
            }
          }}
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"
        >
          {/* Reorder */}
          <div className="flex flex-col">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={isFirst}
              aria-label="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={isLast}
              aria-label="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
          {/* Labels + value chip */}
          <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
            <span className="truncate font-medium">
              {option.label || (
                <span className="italic text-muted-foreground">
                  (no label)
                </span>
              )}
            </span>
            {arDisplay && (
              <>
                <span className="text-muted-foreground">/</span>
                <span dir="rtl" className="truncate text-muted-foreground">
                  {arDisplay}
                </span>
              </>
            )}
            <span className="font-mono text-xs text-muted-foreground ml-auto">
              value: {option.value}
            </span>
          </div>
          {/* Edit + delete */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label="Edit option"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Delete option"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
