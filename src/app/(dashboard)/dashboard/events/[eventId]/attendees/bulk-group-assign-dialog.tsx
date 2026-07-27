"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BulkGroup } from "./types";

// Bulk group-assign dialog. Groups are lazy-fetched the first time it opens
// (they aren't needed for the rest of the page). Controlled by the page;
// the toolbar button guards against an empty selection before opening.
export function BulkGroupAssignDialog({
  open,
  onOpenChange,
  eventId,
  selectedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  selectedIds: Set<string>;
}) {
  const [groups, setGroups] = useState<BulkGroup[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [valueId, setValueId] = useState<string>("");
  const [mode, setMode] = useState<"set" | "add" | "remove">("set");
  const [applying, setApplying] = useState(false);

  // Lazy-load groups the first time the dialog opens.
  useEffect(() => {
    if (!open || groups.length > 0) return;
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/groups`);
        if (res.ok) {
          const data: BulkGroup[] = await res.json();
          setGroups(data);
        } else {
          toast.error("Failed to load groups");
        }
      } catch {
        toast.error("Failed to load groups");
      }
    })();
  }, [open, groups.length, eventId]);

  function onGroupChange(id: string) {
    setGroupId(id);
    setValueId("");
    // Single-value groups default to "Set"; multi-value to "Add".
    const g = groups.find((x) => x.id === id);
    setMode(g && g.allowMultiple ? "add" : "set");
  }

  async function applyGroupAssign() {
    if (!groupId || !valueId) {
      toast.error("Pick a group and a value");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/groups/${groupId}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactIds: Array.from(selectedIds),
            valueId,
            mode,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update attendees");
        return;
      }
      const result = await res.json();
      const verb = mode === "remove" ? "Removed from" : "Applied to";
      toast.success(`${verb} ${result.affected} attendee(s)`);
      onOpenChange(false);
      setGroupId("");
      setValueId("");
      // No list refetch: group values aren't shown in the table (Stage 3),
      // so there's nothing on-screen to refresh — and skipping it avoids
      // any dialog-close/refetch commit race.
    } catch {
      toast.error("Failed to update attendees");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Set group for {selectedIds.size} attendee
            {selectedIds.size !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>
        {groups.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No groups defined yet. Create one in Settings → Groups first.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={groupId} onValueChange={onGroupChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const group = groups.find((g) => g.id === groupId);
              if (!group) return null;
              return (
                <>
                  <div className="space-y-1.5">
                    <Label>Value</Label>
                    <Select value={valueId} onValueChange={setValueId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a value" />
                      </SelectTrigger>
                      <SelectContent>
                        {group.values.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            This group has no values yet.
                          </div>
                        ) : (
                          group.values.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Action</Label>
                    <Select
                      value={mode}
                      onValueChange={(v) =>
                        setMode(v as "set" | "add" | "remove")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {group.allowMultiple && (
                          <SelectItem value="add">
                            Add this value
                          </SelectItem>
                        )}
                        <SelectItem value="set">
                          {group.allowMultiple
                            ? "Set to only this value"
                            : "Set to this value"}
                        </SelectItem>
                        <SelectItem value="remove">
                          Remove this value
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={applying}
              >
                Cancel
              </Button>
              <Button
                onClick={applyGroupAssign}
                disabled={applying || !groupId || !valueId}
              >
                {applying ? "Applying…" : "Apply"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
