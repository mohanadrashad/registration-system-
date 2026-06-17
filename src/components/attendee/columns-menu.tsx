"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Columns3, GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ManageableColumn = { key: string; label: string };

function SortableRow({
  column,
  checked,
  onToggle,
}: {
  column: ManageableColumn;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: column.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md px-1.5 py-1.5 ${
        isDragging ? "bg-muted shadow-sm" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        aria-label={`Drag to reorder ${column.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <label className="flex flex-1 items-center gap-2 cursor-pointer select-none text-sm">
        <Checkbox checked={checked} onCheckedChange={() => onToggle(column.key)} />
        {column.label}
      </label>
    </div>
  );
}

/**
 * Column visibility + reorder menu for the attendees table. Reordering is
 * drag-and-drop (dnd-kit); each column also has a checkbox to show/hide it.
 * `columns` is the full applicable manageable set IN current display order
 * (hidden ones included so they can still be reordered / re-shown). The
 * parent owns the order/hidden state and persistence — this is a pure
 * controlled view.
 */
export function ColumnsMenu({
  columns,
  hidden,
  onReorder,
  onToggle,
  onReset,
}: {
  columns: ManageableColumn[];
  hidden: string[];
  onReorder: (orderedKeys: string[]) => void;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = columns.map((c) => c.key);
    const oldIndex = keys.indexOf(String(active.id));
    const newIndex = keys.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(keys, oldIndex, newIndex));
  };

  const hiddenSet = new Set(hidden);
  const shownCount = columns.filter((c) => !hiddenSet.has(c.key)).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="h-4 w-4" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {shownCount} of {columns.length} shown
          </span>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={columns.map((c) => c.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="max-h-72 overflow-y-auto">
              {columns.map((column) => (
                <SortableRow
                  key={column.key}
                  column={column}
                  checked={!hiddenSet.has(column.key)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <p className="px-1.5 pt-1.5 text-[11px] text-muted-foreground/70">
          Name is always shown first. Drag the handle to reorder.
        </p>
      </PopoverContent>
    </Popover>
  );
}
