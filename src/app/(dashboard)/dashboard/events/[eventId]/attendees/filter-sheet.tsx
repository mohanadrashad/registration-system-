"use client";

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterMultiSelect } from "@/components/attendee/filter-multi-select";
import {
  fieldFilterOptions,
  type FilterableField,
} from "@/lib/attendees/field-filter-options";

// "Filters" button + side panel of dynamic per-field multi-selects. A side
// panel (not a popover) so long option lists have room and nothing gets
// clipped.
export function FilterSheet({
  filterableFields,
  fieldFilters,
  activeFilterCount,
  onToggle,
  onClearOne,
  onClearAll,
}: {
  filterableFields: FilterableField[];
  fieldFilters: Record<string, string[]>;
  activeFilterCount: number;
  onToggle: (name: string, value: string) => void;
  onClearOne: (name: string) => void;
  onClearAll: () => void;
}) {
  if (filterableFields.length === 0) return null;

  const formFields = filterableFields.filter((f) => f.type !== "GROUP");
  const groupFields = filterableFields.filter((f) => f.type === "GROUP");
  const control = (f: FilterableField) => (
    <FilterMultiSelect
      key={f.name}
      label={f.label}
      options={fieldFilterOptions(f)}
      selected={fieldFilters[f.name] ?? []}
      onToggle={(v) => onToggle(f.name, v)}
      onClear={() => onClearOne(f.name)}
    />
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {formFields.length > 0 && groupFields.length > 0 && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Form answers
            </p>
          )}
          {formFields.map(control)}
          {groupFields.length > 0 && (
            <div className="space-y-5 border-t pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Groups
              </p>
              {groupFields.map(control)}
            </div>
          )}
        </div>
        <SheetFooter className="flex-row items-center justify-between border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            disabled={activeFilterCount === 0}
          >
            Clear all
          </Button>
          <SheetClose asChild>
            <Button size="sm">Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
