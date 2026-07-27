"use client";

import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fieldFilterOptions,
  type FilterableField,
} from "@/lib/attendees/field-filter-options";
import type { PostRegPhase } from "./types";

// Option-filter chip — visible only when deep-linked from the statistics
// page (?phase=X&option=Y). Single chip with an × that clears both params
// from the URL via the page's state setters.
export function OptionFilterChip({
  phaseId,
  optionId,
  postRegPhases,
  onClear,
}: {
  phaseId: string | null;
  optionId: string | null;
  postRegPhases: PostRegPhase[];
  onClear: () => void;
}) {
  if (!phaseId || !optionId) return null;
  const phase = postRegPhases.find((p) => p.id === phaseId);
  const option = phase?.options?.find((o) => o.id === optionId);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Filtered:</span>
      <span className="font-medium">
        {phase?.title ?? "phase"} → {option?.label ?? "option"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-7"
        onClick={onClear}
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">Clear filter</span>
      </Button>
    </div>
  );
}

// Active filter chips — one per SELECTED VALUE (a filter with two values
// shows two chips), individually removable. Lives outside the Filters
// panel so the admin always sees what's narrowing the list.
export function ActiveFilterChips({
  fieldFilters,
  filterableFields,
  onToggle,
  onClearAll,
}: {
  fieldFilters: Record<string, string[]>;
  filterableFields: FilterableField[];
  onToggle: (name: string, value: string) => void;
  onClearAll: () => void;
}) {
  const activeFilterCount = Object.values(fieldFilters).reduce(
    (n, vals) => n + vals.length,
    0
  );
  if (activeFilterCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Filtered:</span>
      {Object.entries(fieldFilters).flatMap(([name, values]) => {
        const field = filterableFields.find((f) => f.name === name);
        const opts = field ? fieldFilterOptions(field) : [];
        return values.map((value) => {
          const option = opts.find((o) => o.value === value);
          return (
            <span
              key={`${name}:${value}`}
              className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5"
            >
              <span className="text-muted-foreground">
                {field?.label ?? name}:
              </span>
              <span className="font-medium">{option?.label ?? value}</span>
              <button
                type="button"
                className="ml-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => onToggle(name, value)}
              >
                <X className="h-3 w-3" />
                <span className="sr-only">
                  Remove {field?.label ?? name} {option?.label ?? value} filter
                </span>
              </button>
            </span>
          );
        });
      })}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7"
        onClick={onClearAll}
      >
        Clear all
      </Button>
    </div>
  );
}
