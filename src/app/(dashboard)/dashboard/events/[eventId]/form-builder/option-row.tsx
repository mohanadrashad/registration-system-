"use client";

import { useMemo } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OptionEditor } from "./option-editor";
import type { PhaseOption } from "./phase-option-types";

// ─── OptionRow: collapsed summary + ⋯ menu, expands to full editor. ──

interface OptionRowProps {
  option: PhaseOption;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  isPending: boolean;
  error: string | null;
  phaseRequiresReceipt: boolean;
  multiLanguageEnabled: boolean;
  onToggleEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onClearError: () => void;
  onPatch: (
    patch: Partial<PhaseOption>,
    optimistic: Partial<PhaseOption>
  ) => Promise<void>;
}

export function OptionRow({
  option,
  isFirst,
  isLast,
  isEditing,
  isPending,
  error,
  phaseRequiresReceipt,
  multiLanguageEnabled,
  onToggleEdit,
  onMove,
  onDelete,
  onClearError,
  onPatch,
}: OptionRowProps) {
  const selectionCount = option._count?.selections ?? 0;
  const capacityBadge = useMemo(() => {
    if (option.capacity == null) return "no cap";
    return `${selectionCount} / ${option.capacity}`;
  }, [option.capacity, selectionCount]);

  const receiptBadge = useMemo(() => {
    if (option.requiresReceipt === true) return "Receipt: required";
    if (option.requiresReceipt === false) return "Receipt: never";
    return `Receipt: inherit (${phaseRequiresReceipt ? "required" : "off"})`;
  }, [option.requiresReceipt, phaseRequiresReceipt]);

  // Visual surface: muted + spinner on pending; red border on error.
  const stateClass = error
    ? "border-destructive/60"
    : !option.isActive
    ? "opacity-60"
    : "";

  return (
    <div
      className={`rounded-md border bg-background ${stateClass}`}
      aria-busy={isPending}
    >
      {/* Collapsed summary row */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{option.label}</span>
            {!option.isActive && (
              <Badge variant="outline" className="text-xs">
                Inactive
              </Badge>
            )}
            {option.externalUrl && (
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            )}
            {isPending && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
            {error && !isPending && (
              <AlertCircle
                className="h-3 w-3 text-destructive"
                aria-label={error}
              />
            )}
          </div>
          {option.labelAr && (
            <div
              dir="rtl"
              className="text-xs text-muted-foreground truncate"
            >
              {option.labelAr}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{capacityBadge}</span>
          <span>·</span>
          <span>{receiptBadge}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onMove("up")}
              disabled={isFirst || isPending}
            >
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onMove("down")}
              disabled={isLast || isPending}
            >
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              {isEditing ? "Close editor" : "Edit"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              disabled={isPending}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-t border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="flex-1">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6"
            onClick={onClearError}
          >
            Dismiss
          </Button>
        </div>
      )}

      {isEditing && (
        <OptionEditor
          option={option}
          isPending={isPending}
          phaseRequiresReceipt={phaseRequiresReceipt}
          multiLanguageEnabled={multiLanguageEnabled}
          onPatch={onPatch}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
