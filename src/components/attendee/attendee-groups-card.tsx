"use client";

import { useCallback, useEffect, useState } from "react";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix Select can't use "" as a value; this sentinel = cleared.
const NONE_VALUE = "__none__";

interface GroupValue {
  id: string;
  label: string;
  color: string | null;
}

interface GroupWithSelection {
  id: string;
  name: string;
  allowMultiple: boolean;
  values: GroupValue[];
  selectedValueIds: string[];
}

/**
 * Per-attendee assignment of custom Attendee Groups. Self-fetches the
 * event's groups + this contact's current selections; renders nothing
 * when the event defines no groups (so events that don't use the feature
 * see no extra card). Single-value groups use a dropdown, multi-value
 * groups use toggle chips. Writes are optimistic — no Dialog, no parent
 * refetch, so there's no commit-phase race to manage.
 */
export function AttendeeGroupsCard({
  eventId,
  contactId,
  canEdit,
}: {
  eventId: string;
  contactId: string;
  canEdit: boolean;
}) {
  const [groups, setGroups] = useState<GroupWithSelection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/groups`
      );
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch {
      // Non-fatal: the card just stays empty.
    } finally {
      setLoaded(true);
    }
  }, [eventId, contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setValues(group: GroupWithSelection, valueIds: string[]) {
    const prev = group.selectedValueIds;
    // Optimistic update.
    setGroups((gs) =>
      gs.map((g) => (g.id === group.id ? { ...g, selectedValueIds: valueIds } : g))
    );
    setSavingId(group.id);
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/groups/${group.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valueIds }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to update");
        // Revert.
        setGroups((gs) =>
          gs.map((g) =>
            g.id === group.id ? { ...g, selectedValueIds: prev } : g
          )
        );
      }
    } catch {
      toast.error("Failed to update");
      setGroups((gs) =>
        gs.map((g) => (g.id === group.id ? { ...g, selectedValueIds: prev } : g))
      );
    } finally {
      setSavingId(null);
    }
  }

  // Render nothing until we know, and nothing when the event has no groups.
  if (!loaded || groups.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tags className="h-4 w-4" />
          Groups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => {
          const selected = new Set(group.selectedValueIds);
          return (
            <div key={group.id} className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {group.name}
              </Label>

              {/* Read-only view for non-editors. */}
              {!canEdit ? (
                group.selectedValueIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {group.values
                      .filter((v) => selected.has(v.id))
                      .map((v) => (
                        <span
                          key={v.id}
                          className="inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium"
                        >
                          {v.label}
                        </span>
                      ))}
                  </div>
                )
              ) : group.allowMultiple ? (
                /* Multi-value: toggle chips. */
                <div className="flex flex-wrap gap-1.5">
                  {group.values.map((v) => {
                    const isOn = selected.has(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={savingId === group.id}
                        onClick={() => {
                          const next = isOn
                            ? group.selectedValueIds.filter((id) => id !== v.id)
                            : [...group.selectedValueIds, v.id];
                          setValues(group, next);
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50",
                          isOn
                            ? "border-primary bg-primary/10 text-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Single-value: dropdown with a clear option. */
                <Select
                  value={group.selectedValueIds[0] ?? NONE_VALUE}
                  onValueChange={(val) =>
                    setValues(group, val === NONE_VALUE ? [] : [val])
                  }
                  disabled={savingId === group.id}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                    {group.values.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
