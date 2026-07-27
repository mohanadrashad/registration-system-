import { useCallback, useEffect, useMemo, useState } from "react";
import type { ManageableColumn } from "@/components/attendee/columns-menu";
import {
  MANAGEABLE_COLUMNS,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_HIDDEN,
  columnStorageKey,
  formColumnKey,
  groupColumnKey,
  isPersistedColumnKey,
} from "./columns";

// Column show/hide + order state for the attendees table, persisted
// per-event in localStorage. Defaults render on first paint (matches the
// server HTML, so no hydration mismatch); the user's saved layout loads
// from localStorage on mount and is persisted only on explicit user
// actions (never from the load itself, so the load can't be clobbered).
export function useColumnManager({
  eventId,
  formColumns,
  groupColumns,
  phaseColumns,
}: {
  eventId: string;
  formColumns: { name: string; label: string; type: string }[];
  groupColumns: { id: string; name: string }[];
  phaseColumns: { key: string; label: string }[];
}) {
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => [...DEFAULT_HIDDEN]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(columnStorageKey(eventId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { order?: unknown; hidden?: unknown };

      const savedOrder = Array.isArray(parsed.order)
        ? parsed.order.filter(isPersistedColumnKey)
        : [];
      // Append built-in columns added since the layout was saved; form
      // columns are materialized separately once their definitions arrive.
      const newBuiltins = DEFAULT_COLUMN_ORDER.filter((k) => !savedOrder.includes(k));
      if (savedOrder.length > 0) setColumnOrder([...savedOrder, ...newBuiltins]);

      const savedHidden = Array.isArray(parsed.hidden)
        ? parsed.hidden.filter(isPersistedColumnKey)
        : [];
      const newlyHidden = newBuiltins.filter((k) => DEFAULT_HIDDEN.has(k));
      setHiddenColumns([...new Set([...savedHidden, ...newlyHidden])]);
    } catch {
      // ignore malformed/unavailable storage — fall back to defaults
    }
  }, [eventId]);

  // Materialize dynamic (form-answer + group) columns once their definitions
  // load: append any not yet in the order and default the newly-discovered
  // ones to hidden. A dynamic column the admin previously revealed stays in
  // the saved order, so it isn't re-hidden. State only — persisted on the
  // next user action.
  useEffect(() => {
    const dynamicKeys = [
      ...formColumns.map((f) => formColumnKey(f.name)),
      ...groupColumns.map((g) => groupColumnKey(g.id)),
      ...phaseColumns.map((p) => p.key),
    ];
    if (dynamicKeys.length === 0) return;
    const known = new Set(columnOrder);
    const missing = dynamicKeys.filter((k) => !known.has(k));
    if (missing.length === 0) return;
    setColumnOrder((prev) => [...prev, ...missing]);
    setHiddenColumns((prev) => {
      const toHide = missing.filter((k) => !prev.includes(k));
      return toHide.length ? [...prev, ...toHide] : prev;
    });
  }, [formColumns, groupColumns, phaseColumns, columnOrder]);

  const persistColumns = useCallback(
    (order: string[], hidden: string[]) => {
      try {
        localStorage.setItem(
          columnStorageKey(eventId),
          JSON.stringify({ order, hidden })
        );
      } catch {
        // ignore — storage may be unavailable (private mode, quota)
      }
    },
    [eventId]
  );

  // All manageable columns = built-ins + form-answer + group + post-reg
  // phase-answer columns.
  const allManageable = useMemo<ManageableColumn[]>(
    () => [
      ...MANAGEABLE_COLUMNS,
      ...formColumns.map((f) => ({ key: formColumnKey(f.name), label: f.label })),
      ...groupColumns.map((g) => ({ key: groupColumnKey(g.id), label: g.name })),
      ...phaseColumns.map((p) => ({ key: p.key, label: p.label })),
    ],
    [formColumns, groupColumns, phaseColumns]
  );
  const allColumnKeys = useMemo(
    () => new Set(allManageable.map((c) => c.key)),
    [allManageable]
  );
  const labelByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of allManageable) m[c.key] = c.label;
    return m;
  }, [allManageable]);
  // FormField.name → field type, so the table can render FILE answers as
  // links (others as text/URL). Built from the form-column meta.
  const formColumnType = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of formColumns) m[f.name] = f.type;
    return m;
  }, [formColumns]);
  // Persisted order limited to columns that still exist, with any built-in
  // not yet present appended (form columns enter via the reconcile effect).
  const effectiveOrder = useMemo(() => {
    const valid = columnOrder.filter((k) => allColumnKeys.has(k));
    const missingBuiltins = DEFAULT_COLUMN_ORDER.filter((k) => !columnOrder.includes(k));
    return [...valid, ...missingBuiltins];
  }, [columnOrder, allColumnKeys]);
  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);

  const handleColumnReorder = useCallback(
    (newSubsetOrder: string[]) => {
      // The menu may show only a subset (e.g. Category is hidden when the
      // list is filtered to one category). Splice the reordered subset back
      // into the full order, leaving any excluded keys in their slots so
      // they aren't dropped from the saved layout.
      const subset = new Set(newSubsetOrder);
      let i = 0;
      const merged = effectiveOrder.map((k) => (subset.has(k) ? newSubsetOrder[i++] : k));
      setColumnOrder(merged);
      persistColumns(merged, hiddenColumns);
    },
    [effectiveOrder, hiddenColumns, persistColumns]
  );

  const handleColumnToggle = useCallback(
    (key: string) => {
      setHiddenColumns((prev) => {
        const next = prev.includes(key)
          ? prev.filter((k) => k !== key)
          : [...prev, key];
        persistColumns(columnOrder, next);
        return next;
      });
    },
    [columnOrder, persistColumns]
  );

  const handleColumnReset = useCallback(() => {
    // Restore built-ins to default and return dynamic (form + group) columns
    // to appended + hidden.
    const dynamicKeys = [
      ...formColumns.map((f) => formColumnKey(f.name)),
      ...groupColumns.map((g) => groupColumnKey(g.id)),
      ...phaseColumns.map((p) => p.key),
    ];
    const order = [...DEFAULT_COLUMN_ORDER, ...dynamicKeys];
    const hidden = [...DEFAULT_HIDDEN, ...dynamicKeys];
    setColumnOrder(order);
    setHiddenColumns(hidden);
    persistColumns(order, hidden);
  }, [formColumns, groupColumns, phaseColumns, persistColumns]);

  return {
    effectiveOrder,
    hiddenColumns,
    hiddenSet,
    labelByKey,
    formColumnType,
    handleColumnReorder,
    handleColumnToggle,
    handleColumnReset,
  };
}
