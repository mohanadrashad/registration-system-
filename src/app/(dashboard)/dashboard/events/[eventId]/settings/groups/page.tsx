"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Tags, Loader2, X } from "lucide-react";

interface GroupValue {
  id: string;
  label: string;
  color: string | null;
  order: number;
}

interface AttendeeGroup {
  id: string;
  name: string;
  allowMultiple: boolean;
  order: number;
  values: GroupValue[];
}

export default function GroupsSettingsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [groups, setGroups] = useState<AttendeeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newAllowMultiple, setNewAllowMultiple] = useState(false);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/groups`);
      if (res.ok) {
        setGroups(await res.json());
      } else {
        toast.error("Failed to load groups");
      }
    } catch {
      toast.error("Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/events/${eventId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, allowMultiple: newAllowMultiple }),
      });
      if (res.ok) {
        toast.success(`Group "${name}" created`);
        setNewName("");
        setNewAllowMultiple(false);
        await refetch();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to create group");
      }
    } catch {
      toast.error("Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendee Groups"
        description="Custom ways to classify attendees (e.g. Ranking, Region) — assign them on the Attendees page and filter by them. Separate from the built-in Category."
      />

      {/* Create a new group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New group</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-group-name">Group name</Label>
              <Input
                id="new-group-name"
                placeholder="e.g. Ranking"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createGroup();
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-2 pb-2 sm:pb-2.5">
              <Switch
                id="new-group-multi"
                checked={newAllowMultiple}
                onCheckedChange={setNewAllowMultiple}
              />
              <Label htmlFor="new-group-multi" className="text-sm font-normal">
                Allow multiple values
              </Label>
            </div>
            <Button onClick={createGroup} disabled={creating || !newName.trim()}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            “Allow multiple” lets an attendee hold several values from this
            group at once. Leave it off for a single choice like Ranking.
          </p>
        </CardContent>
      </Card>

      {/* Existing groups */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Tags className="h-8 w-8 opacity-40" />
            <p>No groups yet. Create one above to start classifying attendees.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              eventId={eventId}
              group={group}
              onChanged={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  eventId,
  group,
  onChanged,
}: {
  eventId: string;
  group: AttendeeGroup;
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState(group.name);
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);

  // Keep the local name draft in sync if the list refetches with a new
  // server value (e.g. another tab renamed it).
  useEffect(() => {
    setName(group.name);
  }, [group.name]);

  async function patchGroup(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to update group");
        return false;
      }
      await onChanged();
      return true;
    } catch {
      toast.error("Failed to update group");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === group.name) {
      setName(group.name);
      return;
    }
    const ok = await patchGroup({ name: trimmed });
    if (ok) toast.success("Group renamed");
  }

  async function deleteGroup() {
    if (
      !confirm(
        `Delete the group "${group.name}"? This removes it from every attendee who has it.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/groups/${group.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to delete group");
        return;
      }
      toast.success("Group deleted");
      await onChanged();
    } catch {
      toast.error("Failed to delete group");
    } finally {
      setBusy(false);
    }
  }

  async function addValue() {
    const label = newValue.trim();
    if (!label) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/groups/${group.id}/values`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to add value");
        return;
      }
      setNewValue("");
      await onChanged();
    } catch {
      toast.error("Failed to add value");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="max-w-xs text-base font-semibold"
          aria-label="Group name"
        />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={`multi-${group.id}`}
              checked={group.allowMultiple}
              onCheckedChange={(v) => patchGroup({ allowMultiple: v })}
              disabled={busy}
            />
            <Label
              htmlFor={`multi-${group.id}`}
              className="whitespace-nowrap text-xs font-normal text-muted-foreground"
            >
              Allow multiple
            </Label>
          </div>
          <button
            type="button"
            onClick={deleteGroup}
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            title="Delete group"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.values.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No values yet — add the choices for this group below (e.g. Gold,
            Silver, Bronze).
          </p>
        ) : (
          <div className="space-y-2">
            {group.values.map((value) => (
              <ValueRow
                key={value.id}
                eventId={eventId}
                groupId={group.id}
                value={value}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
        <div className="flex gap-2 sm:max-w-sm">
          <Input
            placeholder="Add a value…"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addValue();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addValue}
            disabled={busy || !newValue.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ValueRow({
  eventId,
  groupId,
  value,
  onChanged,
}: {
  eventId: string;
  groupId: string;
  value: GroupValue;
  onChanged: () => Promise<void> | void;
}) {
  const [label, setLabel] = useState(value.label);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabel(value.label);
  }, [value.label]);

  async function saveLabel() {
    const trimmed = label.trim();
    if (!trimmed || trimmed === value.label) {
      setLabel(value.label);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/groups/${groupId}/values/${value.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: trimmed }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to rename value");
        setLabel(value.label);
        return;
      }
      await onChanged();
    } catch {
      toast.error("Failed to rename value");
      setLabel(value.label);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/groups/${groupId}/values/${value.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to delete value");
        return;
      }
      await onChanged();
    } catch {
      toast.error("Failed to delete value");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        disabled={busy}
        className="h-9 max-w-xs"
        aria-label="Value label"
      />
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        title="Delete value"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
