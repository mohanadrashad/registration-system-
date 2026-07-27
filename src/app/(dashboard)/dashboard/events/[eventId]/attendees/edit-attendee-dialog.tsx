"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Contact } from "./types";

// Quick-edit dialog for a single attendee row. Controlled by the page
// (open + contact); the category/status select values are local state,
// re-seeded whenever a different contact is opened.
export function EditAttendeeDialog({
  open,
  onOpenChange,
  contact,
  categories,
  eventId,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  categories: string[] | undefined;
  eventId: string;
  onSaved: () => void;
  onDelete: (contactId: string) => void;
}) {
  const [categoryValue, setCategoryValue] = useState<string>("");
  const [statusValue, setStatusValue] = useState<string>("");

  // Re-seed the select values from the contact every time the dialog opens
  // (state-during-render, so the first paint already shows the right values —
  // same as the original page, which seeded them in openEditDialog).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && contact) {
      setCategoryValue(contact.category || "");
      setStatusValue(contact.status);
    }
  }

  async function handleEditContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contact) return;

    const formData = new FormData(e.currentTarget);
    const data: Record<string, string | null> = {
      firstName: (formData.get("firstName") as string) || contact.firstName,
      lastName: (formData.get("lastName") as string) || contact.lastName,
      email: (formData.get("email") as string) || contact.email,
      phone: (formData.get("phone") as string) || null,
      organization: (formData.get("organization") as string) || null,
      designation: (formData.get("designation") as string) || null,
      category: categoryValue || null,
      status: statusValue || contact.status,
    };

    const res = await fetch(`/api/events/${eventId}/contacts/${contact.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success("Attendee updated");
      onOpenChange(false);
      onSaved();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error?.fieldErrors ? "Validation error" : "Failed to update attendee");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Attendee</DialogTitle>
        </DialogHeader>
        {contact && (
          <form onSubmit={handleEditContact} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input name="firstName" defaultValue={contact.firstName} required />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input name="lastName" defaultValue={contact.lastName} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={contact.email} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input name="phone" defaultValue={contact.phone || ""} />
              </div>
              <div className="space-y-2">
                <Label>Organization</Label>
                <Input name="organization" defaultValue={contact.organization || ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Designation</Label>
              <Input name="designation" defaultValue={contact.designation || ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                {categories && categories.length > 0 ? (
                  <Select value={categoryValue} onValueChange={setCategoryValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={categoryValue}
                    onChange={(e) => setCategoryValue(e.target.value)}
                    placeholder="Category name"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusValue} onValueChange={setStatusValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMPORTED">Imported</SelectItem>
                    <SelectItem value="INVITED">Invited</SelectItem>
                    <SelectItem value="REGISTERED">Registered</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between">
              <Button
                variant="destructive"
                type="button"
                onClick={() => {
                  onDelete(contact.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
