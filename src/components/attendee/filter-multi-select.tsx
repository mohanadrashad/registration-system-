"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * One multi-select filter control. Renders its options as an inline
 * checkbox list (no nested dropdown/portal — so nothing gets clipped by a
 * scroll container, which was the old single-Select bug). Long option
 * lists (countries, cities) get a search box. Selecting several values
 * means OR within this filter; the server handles the predicate.
 */
export function FilterMultiSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const showSearch = options.length > 8;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear ({selected.length})
          </button>
        )}
      </div>
      {showSearch && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="h-8"
        />
      )}
      <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
        {filtered.length === 0 ? (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">No matches</p>
        ) : (
          filtered.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => onToggle(o.value)}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
