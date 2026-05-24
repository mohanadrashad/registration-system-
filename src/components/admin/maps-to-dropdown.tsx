"use client";

import { useState } from "react";
import { FieldMapping, FieldType } from "@prisma/client";
import { Tag, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  COMPATIBLE_FIELD_TYPES,
  FIELD_MAPPING_LABELS,
  MULTI_VALUE_ROLES,
} from "@/lib/form-builder/field-mapping-labels";

interface SiblingField {
  id: string;
  label: string;
  mapsTo: FieldMapping | null;
}

interface Props {
  eventId: string;
  fieldId: string;
  fieldType: FieldType;
  currentMapsTo: FieldMapping | null;
  /** All FormFields on the event — used to detect "taken" roles. */
  siblings: SiblingField[];
  /**
   * Parent refetch trigger. Called on success of any PATCH or swap.
   * Deferred to the next macrotask via setTimeout(0) inside this
   * component so Radix's DropdownMenu unmount completes first —
   * mirrors the lesson recorded in radix-dialog-post-refetch-race.md.
   */
  onChanged: () => void;
}

const ROLE_ORDER: FieldMapping[] = [
  "FIRST_NAME",
  "LAST_NAME",
  "FULL_NAME",
  "EMAIL",
  "PHONE",
  "ORGANIZATION",
  "DESIGNATION",
];

export function MapsToDropdown({
  eventId,
  fieldId,
  fieldType,
  currentMapsTo,
  siblings,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);

  // Type-filtered role list — mirrors the server-side validator so the
  // menu only shows roles that PATCH would accept for this field type.
  const compatibleRoles = ROLE_ORDER.filter((role) =>
    COMPATIBLE_FIELD_TYPES[role].has(fieldType)
  );

  // No role is compatible with this field type AND no role is currently
  // assigned: rendering the control would be a no-op (the menu would
  // hold only "Not mapped" alongside zero selectable roles). Hide it.
  // When a role IS currently assigned (e.g. legacy data where admin
  // changed the field type after tagging), keep the control visible so
  // they can clear it.
  if (compatibleRoles.length === 0 && currentMapsTo === null) {
    return null;
  }

  function deferRefetch() {
    // Push the parent refetch to the next macrotask so Radix's
    // DropdownMenu unmount completes first. Same defensive pattern as
    // documented in radix-dialog-post-refetch-race.md — without this,
    // close+refetch in the same flow can throw a DOMException through
    // FocusScope's focus restoration.
    setTimeout(() => onChanged(), 0);
  }

  async function setMapping(role: FieldMapping | null) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/form-fields/${fieldId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mapsTo: role }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to update mapping");
        return;
      }
      toast.success(
        role === null
          ? "Mapping cleared"
          : `Mapped to ${FIELD_MAPPING_LABELS[role]}`
      );
      deferRefetch();
    } finally {
      setBusy(false);
    }
  }

  async function swapMapping(fromFieldId: string, role: FieldMapping) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/form-fields/${fieldId}/swap-mapping`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromFieldId, role }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to swap mapping");
        return;
      }
      toast.success(`${FIELD_MAPPING_LABELS[role]} reassigned`);
      deferRefetch();
    } finally {
      setBusy(false);
    }
  }

  // Build "taken by" lookup for single-value roles. LAST_NAME (multi-value)
  // never appears here — it's selectable by any compatible field with no
  // conflict UX. Skip the current field (it's not a conflict against itself).
  const takenBy = new Map<FieldMapping, SiblingField>();
  for (const s of siblings) {
    if (s.id === fieldId) continue;
    if (s.mapsTo === null) continue;
    if (MULTI_VALUE_ROLES.has(s.mapsTo)) continue;
    takenBy.set(s.mapsTo, s);
  }

  const mapped = currentMapsTo !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={mapped ? "secondary" : "outline"}
          size="sm"
          className="h-8 px-2 text-xs font-normal whitespace-nowrap"
          disabled={busy}
        >
          {mapped ? (
            <>
              <Tag className="h-3 w-3 mr-1" />
              {FIELD_MAPPING_LABELS[currentMapsTo]}
            </>
          ) : (
            <span className="text-muted-foreground">Maps to —</span>
          )}
          <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem
          onSelect={() => setMapping(null)}
          className="text-muted-foreground"
        >
          — Not mapped
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {compatibleRoles.map((role) => {
          const taken = takenBy.get(role);
          const isCurrent = currentMapsTo === role;
          if (taken && !isCurrent) {
            // Two-line custom item with right-aligned Swap button. Not a
            // DropdownMenuItem — keyboard nav skips it and clicks on the
            // body do nothing, so the Swap button is the only action.
            return (
              <div
                key={role}
                className="px-2 py-1.5 text-sm"
                role="presentation"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-foreground">
                      {FIELD_MAPPING_LABELS[role]}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Used by &quot;{taken.label}&quot;
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs shrink-0"
                    disabled={busy}
                    onClick={() => swapMapping(taken.id, role)}
                  >
                    Swap →
                  </Button>
                </div>
              </div>
            );
          }
          return (
            <DropdownMenuItem
              key={role}
              onSelect={() => setMapping(role)}
              className={isCurrent ? "font-medium" : undefined}
            >
              {isCurrent && <Tag className="h-3 w-3 mr-2" />}
              {FIELD_MAPPING_LABELS[role]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
