"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Users2 } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

type EventRole = Exclude<AppRole, "SUPER_ADMIN">;

interface Member {
  id: string;
  role: EventRole;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: AppRole;
  };
}

export default function EventTeamPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    email: "",
    role: "VIEWER" as EventRole,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/members`);
      if (res.ok) setMembers(await res.json());
      else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to load team");
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/events/${eventId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Member added");
      setAddOpen(false);
      setAddForm({ email: "", role: "VIEWER" });
      fetchMembers();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to add member");
    }
  }

  async function handleRoleChange(userId: string, role: EventRole) {
    const res = await fetch(`/api/events/${eventId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      toast.success("Role updated");
      fetchMembers();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to update role");
    }
  }

  async function handleRemove(member: Member) {
    if (
      !confirm(
        `Remove ${member.user.email} from this event? They will lose access immediately.`
      )
    )
      return;
    const res = await fetch(
      `/api/events/${eventId}/members/${member.user.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Member removed");
      fetchMembers();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to remove member");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Manage who can access this event"
      >
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add team member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  value={addForm.email}
                  onChange={(e) =>
                    setAddForm({ ...addForm, email: e.target.value })
                  }
                  placeholder="teammate@example.com"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The user must already have an account.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={addForm.role}
                  onValueChange={(v) =>
                    setAddForm({ ...addForm, role: v as EventRole })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEWER">Viewer — view only</SelectItem>
                    <SelectItem value="EDITOR">Editor — edit, no delete</SelectItem>
                    <SelectItem value="MANAGER">Manager — full event control</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Adding…" : "Add"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No team members yet</p>
            <p className="text-sm text-muted-foreground">
              Add someone so they can manage this event.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Role on this event
                </th>
                <th className="w-20 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">
                    {m.user.name || "-"}
                    {m.user.role === "SUPER_ADMIN" && (
                      <Badge variant="default" className="ml-2 text-xs">
                        Super admin
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.user.email}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        handleRoleChange(m.user.id, v as EventRole)
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue>{ROLE_LABELS[m.role]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                        <SelectItem value="EDITOR">Editor</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemove(m)}
                      className="rounded-md p-1.5 transition-colors hover:bg-destructive/10"
                      title="Remove from event"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
