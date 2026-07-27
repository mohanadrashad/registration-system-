"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
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

// "Import" button + CSV/Excel upload dialog (self-contained: owns its open
// state).
export function ImportAttendeesDialog({
  eventId,
  categories,
  defaultCategory,
  onImported,
}: {
  eventId: string;
  categories: string[] | undefined;
  // Pre-filled (and applied when the file has no category column) when the
  // list is filtered to a single real category.
  defaultCategory: string | undefined;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!formData.get("category") && defaultCategory) {
      formData.set("category", defaultCategory);
    }

    const res = await fetch(`/api/events/${eventId}/contacts/import`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      toast.error("Import failed");
      return;
    }
    const result = await res.json();
    toast.success(`Imported: ${result.summary.created} created, ${result.summary.skipped} skipped`);
    setOpen(false);
    onImported();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Attendees</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleImport} className="space-y-4">
          <div className="space-y-2">
            <Label>CSV or Excel File</Label>
            <Input type="file" name="file" accept=".csv,.xlsx,.xls" required />
            <p className="text-xs text-muted-foreground">
              Columns: First Name, Last Name, Email, Phone, Organization, Category
            </p>
          </div>
          {categories && categories.length > 0 && (
            <div className="space-y-2">
              <Label>Assign Category</Label>
              <Select name="category" defaultValue={defaultCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Use category from file" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {defaultCategory && (
                <p className="text-xs text-muted-foreground">
                  Pre-filled with current category tab: <strong>{defaultCategory}</strong>
                </p>
              )}
            </div>
          )}
          <Button type="submit">Import</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
