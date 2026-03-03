"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
  createdAt: string;
}

const roleVariant: Record<AppRole, "default" | "secondary" | "outline" | "destructive"> = {
  SUPER_ADMIN: "default",
  MANAGER: "secondary",
  EDITOR: "outline",
  VIEWER: "outline",
};

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  // Add form state
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "VIEWER" as AppRole });
  // Edit form state
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "VIEWER" as AppRole, password: "" });

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string })?.role;
    if (!session || role !== "SUPER_ADMIN") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (res.ok) {
      toast.success("User created");
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", role: "VIEWER" });
      fetchUsers();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to create user");
    }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    const body: Record<string, string> = {
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
    };
    if (editForm.password) body.password = editForm.password;

    const res = await fetch(`/api/users/${editUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success("User updated");
      setEditOpen(false);
      setEditUser(null);
      fetchUsers();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to update user");
    }
  }

  async function handleDeleteUser(user: User) {
    if (!confirm(`Delete user "${user.email}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("User deleted");
      fetchUsers();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to delete user");
    }
  }

  function openEdit(user: User) {
    setEditUser(user);
    setEditForm({ name: user.name || "", email: user.email, role: user.role, password: "" });
    setEditOpen(true);
  }

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  const currentUserId = (session?.user as { id?: string })?.id;

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description={`${users.length} user${users.length !== 1 ? "s" : ""}`}>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Password <span className="text-destructive">*</span></Label>
                <Input type="password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Role <span className="text-destructive">*</span></Label>
                <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v as AppRole })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEWER">Viewer — view only</SelectItem>
                    <SelectItem value="EDITOR">Editor — edit, no delete</SelectItem>
                    <SelectItem value="MANAGER">Manager — edit + delete</SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Create User</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Role legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["VIEWER", "EDITOR", "MANAGER", "SUPER_ADMIN"] as AppRole[]).map((role) => (
          <div key={role} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{ROLE_LABELS[role]}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {role === "VIEWER" && "View attendees and emails only"}
              {role === "EDITOR" && "Edit attendees + emails, no delete"}
              {role === "MANAGER" && "Edit + delete attendees/emails, no user management"}
              {role === "SUPER_ADMIN" && "Full access including user management"}
            </p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Added</th>
              <th className="w-20 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {user.name || "-"}
                  {user.id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={roleVariant[user.role]} className="text-xs">
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(user)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit user">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    {user.id !== currentUserId && (
                      <button onClick={() => handleDeleteUser(user)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors" title="Delete user">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v as AppRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEWER">Viewer — view only</SelectItem>
                    <SelectItem value="EDITOR">Editor — edit, no delete</SelectItem>
                    <SelectItem value="MANAGER">Manager — edit + delete</SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>New Password <span className="text-xs text-muted-foreground">(leave blank to keep current)</span></Label>
                <Input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="••••••••" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
