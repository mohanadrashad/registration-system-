"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// "Add Attendee" button + dialog (self-contained: owns its open state).
export function AddAttendeeDialog({
  eventId,
  categories,
  defaultCategory,
  onAdded,
}: {
  eventId: string;
  categories: string[] | undefined;
  // Pre-filled when the list is filtered to a single real category.
  defaultCategory: string | undefined;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);

  async function handleAddContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      organization: formData.get("organization"),
      designation: formData.get("designation"),
      category: formData.get("category"),
    };

    const res = await fetch(`/api/events/${eventId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success("Contact added");
      setOpen(false);
      onAdded();
    } else {
      toast.error("Failed to add contact");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Attendee
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Attendee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddContact} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input name="lastName" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input name="email" type="email" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="phone" />
            </div>
            <div className="space-y-2">
              <Label>Organization</Label>
              <Input name="organization" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Designation</Label>
            <Input name="designation" />
          </div>
          {categories && categories.length > 0 && (
            <div className="space-y-2">
              <Label>Category</Label>
              <Select name="category" defaultValue={defaultCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit">Add Attendee</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
