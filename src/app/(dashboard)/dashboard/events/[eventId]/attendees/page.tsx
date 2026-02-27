"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload,
  Plus,
  Download,
  Mail,
  Users,
  UserCheck,
  Send,
  Clock,
  Pencil,
  Trash2,
  BarChart3,
  ArrowUpDown,
} from "lucide-react";

type ContactStatus = "IMPORTED" | "INVITED" | "REGISTERED" | "CANCELLED";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  designation: string | null;
  category: string | null;
  status: ContactStatus;
  registration: { status: string; registeredAt: string; confirmationCode: string } | null;
  emailLogs: { id: string; status: string; sentAt: string | null }[];
}

interface CategoryGroup {
  category: string;
  count: number;
  contacts: Contact[];
}

interface StatusCounts {
  IMPORTED: number;
  INVITED: number;
  REGISTERED: number;
  CANCELLED: number;
}

interface Event {
  id: string;
  name: string;
  slug: string;
  categories: string[];
}

interface EmailTemplate {
  id: string;
  name: string;
  type: string;
  subject: string;
}

const statusConfig: Record<ContactStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; }> = {
  IMPORTED: { label: "Imported", variant: "secondary" },
  INVITED: { label: "Invited", variant: "outline" },
  REGISTERED: { label: "Registered", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

export default function AttendeesPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [emailedSort, setEmailedSort] = useState<"none" | "yes" | "no">("none");

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState<string>("");
  const [editStatusValue, setEditStatusValue] = useState<string>("");

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, categoryFilter, debouncedSearch]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      if (categoryFilter !== "ALL") p.set("category", categoryFilter);
      if (debouncedSearch) p.set("search", debouncedSearch);

      const res = await fetch(`/api/events/${eventId}/attendees?${p}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setGroups(data.groups || []);
      setStatusCounts(data.statusCounts || { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 });
      setTotal(data.total || 0);
      setEvent(data.event || null);
      setTemplates(data.templates || []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, statusFilter, categoryFilter, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleContact(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function togglePageSelection() {
    const pageIds = paginatedContacts.map((c) => c.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    if (allPageSelected) {
      const next = new Set(selectedIds);
      pageIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([...selectedIds, ...pageIds]));
    }
  }

  function selectAllAttendees() {
    const allIds = groups.flatMap((g) => g.contacts).map((c) => c.id);
    setSelectedIds(new Set(allIds));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function openEmailDialog() {
    if (selectedIds.size === 0) {
      toast.error("No contacts selected");
      return;
    }

    if (templates.length === 0) {
      toast.error("No email templates found. Create one first in Email Templates.");
      return;
    }

    setEmailOpen(true);
  }

  async function handleSendWithTemplate(templateId: string) {
    setSending(true);
    setEmailOpen(false);
    try {
      const res = await fetch(`/api/events/${eventId}/attendees/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: Array.from(selectedIds),
          templateId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to send emails");
        return;
      }

      const result = await res.json();
      toast.success(`Sent ${result.sentCount} emails (${result.failedCount} failed)`);
      setSelectedIds(new Set());
      fetchData();
    } catch {
      toast.error("Failed to send emails");
    } finally {
      setSending(false);
    }
  }

  function openEditDialog(contact: Contact) {
    setEditContact(contact);
    setEditCategoryValue(contact.category || "");
    setEditStatusValue(contact.status);
    setEditOpen(true);
  }

  async function handleEditContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editContact) return;

    const formData = new FormData(e.currentTarget);
    const data: Record<string, string | null> = {
      firstName: (formData.get("firstName") as string) || editContact.firstName,
      lastName: (formData.get("lastName") as string) || editContact.lastName,
      email: (formData.get("email") as string) || editContact.email,
      phone: (formData.get("phone") as string) || null,
      organization: (formData.get("organization") as string) || null,
      designation: (formData.get("designation") as string) || null,
      category: editCategoryValue || null,
      status: editStatusValue || editContact.status,
    };

    const res = await fetch(`/api/events/${eventId}/contacts/${editContact.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success("Attendee updated");
      setEditOpen(false);
      setEditContact(null);
      fetchData();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error?.fieldErrors ? "Validation error" : "Failed to update attendee");
    }
  }

  async function handleDeleteContact(contactId: string) {
    if (!confirm("Are you sure you want to delete this attendee?")) return;

    const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success("Attendee deleted");
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(contactId); return next; });
      fetchData();
    } else {
      toast.error("Failed to delete attendee");
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} attendee(s)?`)) return;

    let deleted = 0;
    for (const id of selectedIds) {
      const res = await fetch(`/api/events/${eventId}/contacts/${id}`, { method: "DELETE" });
      if (res.ok) deleted++;
    }

    toast.success(`Deleted ${deleted} attendee(s)`);
    setSelectedIds(new Set());
    fetchData();
  }

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
      setAddOpen(false);
      fetchData();
    } else {
      toast.error("Failed to add contact");
    }
  }

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!formData.get("category") && categoryFilter !== "ALL") {
      formData.set("category", categoryFilter);
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
    setImportOpen(false);
    fetchData();
  }

  function handleExport() {
    window.open(`/api/events/${eventId}/contacts/export?format=csv`, "_blank");
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  // When a specific category is selected, flatten all contacts into one list
  const isSingleCategory = categoryFilter !== "ALL";
  const rawContacts = groups.flatMap((g) => g.contacts);

  // Sort by emailed status if requested
  const allContacts = emailedSort === "none" ? rawContacts : [...rawContacts].sort((a, b) => {
    const aEmailed = a.emailLogs && a.emailLogs.length > 0 ? 1 : 0;
    const bEmailed = b.emailLogs && b.emailLogs.length > 0 ? 1 : 0;
    return emailedSort === "yes" ? bEmailed - aEmailed : aEmailed - bEmailed;
  });

  const visibleCount = groups.reduce((sum, g) => sum + g.count, 0);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(allContacts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedContacts = allContacts.slice(startIdx, startIdx + pageSize);
  const pageContactIds = paginatedContacts.map((c) => c.id);
  const allPageSelected = pageContactIds.length > 0 && pageContactIds.every((id) => selectedIds.has(id));
  const allSelected = allContacts.length > 0 && allContacts.every((c) => selectedIds.has(c.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Attendees" description={`${total} total attendees`}>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
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
              {event?.categories && event.categories.length > 0 && (
                <div className="space-y-2">
                  <Label>Assign Category</Label>
                  <Select name="category" defaultValue={categoryFilter !== "ALL" ? categoryFilter : undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Use category from file" />
                    </SelectTrigger>
                    <SelectContent>
                      {event.categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {categoryFilter !== "ALL" && (
                    <p className="text-xs text-muted-foreground">
                      Pre-filled with current category tab: <strong>{categoryFilter}</strong>
                    </p>
                  )}
                </div>
              )}
              <Button type="submit">Import</Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
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
              {event?.categories && event.categories.length > 0 && (
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select name="category" defaultValue={categoryFilter !== "ALL" ? categoryFilter : undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {event.categories.map((cat) => (
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
      </PageHeader>

      {/* Quick Stats Bar */}
      <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-6 text-sm">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" /> <strong>{total}</strong> Total</span>
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-blue-500" /> <strong>{statusCounts.IMPORTED}</strong> Imported</span>
          <span className="flex items-center gap-1.5"><Send className="h-4 w-4 text-orange-500" /> <strong>{statusCounts.INVITED}</strong> Invited</span>
          <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4 text-green-500" /> <strong>{statusCounts.REGISTERED}</strong> Registered</span>
        </div>
        <Link href={`/dashboard/events/${eventId}/statistics`} className="ml-auto">
          <Button variant="outline" size="sm">
            <BarChart3 className="mr-2 h-4 w-4" />
            View Statistics
          </Button>
        </Link>
      </div>

      {/* Category Tabs */}
      {event?.categories && event.categories.length > 0 && (
        <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
          {["ALL", ...event.categories].map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategoryFilter(cat); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat === "ALL" ? "All Categories" : cat}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); setSelectedIds(new Set()); }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="IMPORTED">Imported</SelectItem>
            <SelectItem value="INVITED">Invited</SelectItem>
            <SelectItem value="REGISTERED">Registered</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Search by name, email, organization..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
          )}
          <Button
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={handleBulkDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button
            variant="outline"
            disabled={selectedIds.size === 0 || sending}
            onClick={openEmailDialog}
          >
            <Mail className="mr-2 h-4 w-4" />
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </div>
      </div>

      {/* Send Email Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Email to {selectedIds.size} attendee{selectedIds.size !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose a template to send:</p>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSendWithTemplate(t.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
              >
                <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                </div>
                <Badge variant="outline" className="ml-auto shrink-0">{t.type}</Badge>
              </button>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-destructive text-center py-4">
                No templates found. Create one in Email Templates first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Attendee Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditContact(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendee</DialogTitle>
          </DialogHeader>
          {editContact && (
            <form onSubmit={handleEditContact} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input name="firstName" defaultValue={editContact.firstName} required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input name="lastName" defaultValue={editContact.lastName} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={editContact.email} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input name="phone" defaultValue={editContact.phone || ""} />
                </div>
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Input name="organization" defaultValue={editContact.organization || ""} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input name="designation" defaultValue={editContact.designation || ""} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  {event?.categories && event.categories.length > 0 ? (
                    <Select value={editCategoryValue} onValueChange={setEditCategoryValue}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {event.categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={editCategoryValue}
                      onChange={(e) => setEditCategoryValue(e.target.value)}
                      placeholder="Category name"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editStatusValue} onValueChange={setEditStatusValue}>
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
                    if (editContact) {
                      handleDeleteContact(editContact.id);
                      setEditOpen(false);
                      setEditContact(null);
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Save Changes</Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Content - always a flat table */}
      {allContacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No attendees found. Import contacts or add them manually.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-10 px-4 py-2">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={togglePageSelection}
                    title="Select this page"
                  />
                </th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Organization</th>
                <th className="text-left px-4 py-2 font-medium">Designation</th>
                {!isSingleCategory && <th className="text-left px-4 py-2 font-medium">Category</th>}
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">
                  <button
                    onClick={() => setEmailedSort(emailedSort === "none" ? "yes" : emailedSort === "yes" ? "no" : "none")}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    title={emailedSort === "none" ? "Sort by emailed" : emailedSort === "yes" ? "Emailed first → Not emailed first" : "Clear sort"}
                  >
                    Emailed
                    <ArrowUpDown className={`h-3.5 w-3.5 ${emailedSort !== "none" ? "text-primary" : "text-muted-foreground"}`} />
                  </button>
                </th>
                <th className="text-left px-4 py-2 font-medium">Invited</th>
                <th className="text-left px-4 py-2 font-medium">Registered</th>
                <th className="w-10 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedContacts.map((contact) => (
                <tr key={contact.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2">
                    <Checkbox
                      checked={selectedIds.has(contact.id)}
                      onCheckedChange={() => toggleContact(contact.id)}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/dashboard/events/${eventId}/attendees/${contact.id}`} className="hover:underline text-primary">
                      {contact.firstName} {contact.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{contact.email}</td>
                  <td className="px-4 py-2">{contact.organization || "-"}</td>
                  <td className="px-4 py-2">{contact.designation || "-"}</td>
                  {!isSingleCategory && (
                    <td className="px-4 py-2">
                      <Badge variant="outline">{contact.category || "Uncategorized"}</Badge>
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <Badge variant={statusConfig[contact.status]?.variant || "secondary"}>
                      {statusConfig[contact.status]?.label || contact.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {contact.emailLogs && contact.emailLogs.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="text-xs">Yes</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {contact.emailLogs && contact.emailLogs.length > 0 && contact.emailLogs[0].sentAt
                      ? new Date(contact.emailLogs[0].sentAt).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {contact.registration?.registeredAt
                      ? new Date(contact.registration.registeredAt).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditDialog(contact)} className="p-1 rounded hover:bg-muted transition-colors" title="Edit attendee">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDeleteContact(contact.id)} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Delete attendee">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Select all banner */}
          {allPageSelected && !allSelected && allContacts.length > pageSize && (
            <div className="px-4 py-2 border-t bg-blue-50 dark:bg-blue-950/30 text-sm text-center">
              All {paginatedContacts.length} attendees on this page are selected.{" "}
              <button onClick={selectAllAttendees} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                Select all {allContacts.length} attendees
              </button>
            </div>
          )}
          {allSelected && allContacts.length > pageSize && (
            <div className="px-4 py-2 border-t bg-blue-50 dark:bg-blue-950/30 text-sm text-center">
              All {allContacts.length} attendees are selected.{" "}
              <button onClick={clearSelection} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                Clear selection
              </button>
            </div>
          )}

          {/* Pagination footer */}
          <div className="px-4 py-3 border-t bg-muted/20 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{visibleCount} attendee{visibleCount !== 1 ? "s" : ""}</span>
              <span className="text-muted-foreground/50">|</span>
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {startIdx + 1}–{Math.min(startIdx + pageSize, allContacts.length)} of {allContacts.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
