"use client";

import { FILTER_NONE_VALUE } from "@/lib/attendees/filter-constants";

// Category Tabs — multi-select. Click categories to toggle them (several
// can be active = OR); "All Categories" clears them. "Uncategorized"
// selects contacts with no category set.
export function CategoryTabs({
  categories,
  selected,
  onToggle,
  onClear,
}: {
  categories: string[] | undefined;
  selected: string[];
  onToggle: (category: string) => void;
  onClear: () => void;
}) {
  if (!categories || categories.length === 0) return null;

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
      <button key="ALL" onClick={onClear} className={tabClass(selected.length === 0)}>
        All Categories
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onToggle(cat)}
          className={tabClass(selected.includes(cat))}
        >
          {cat}
        </button>
      ))}
      <button
        key="UNCATEGORIZED"
        onClick={() => onToggle(FILTER_NONE_VALUE)}
        className={tabClass(selected.includes(FILTER_NONE_VALUE))}
      >
        Uncategorized
      </button>
    </div>
  );
}
