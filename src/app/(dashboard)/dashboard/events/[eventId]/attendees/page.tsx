"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getRole, canEdit, canDelete, type AppRole } from "@/lib/permissions";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { isSyntheticEmail, fallbackName } from "@/components/attendee/field-display";
import { COUNTRIES } from "@/lib/form-builder/countries";
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
  Award,
  Filter,
  X,
  FileSpreadsheet,
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
  registration: { status: string; registeredAt: string; confirmationCode: string; badgeEmailSent: boolean } | null;
  emailLogs: { id: string; status: string; sentAt: string | null }[];
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

interface PostRegPhase {
  id: string;
  title: string;
  options?: { id: string; label: string }[];
}

interface FilterableFieldOption {
  value: string;
  label: string;
  labelAr: string | null;
}

// One entry per option-bearing form field on this event's registration
// form — drives the dynamic "Filters" popover. Comes from the attendees
// API so the filter set always matches the event's actual form.
interface FilterableField {
  name: string;
  label: string;
  labelAr: string | null;
  type: string;
  options: FilterableFieldOption[];
}

// COUNTRY and CHECKBOX fields arrive with empty options — their choices
// are universal, so they're resolved locally instead of shipped per event.
function fieldFilterOptions(field: FilterableField): FilterableFieldOption[] {
  if (field.type === "COUNTRY") {
    return COUNTRIES.map((c) => ({
      value: c.code,
      label: c.name,
      labelAr: c.nameAr,
    }));
  }
  if (field.type === "CHECKBOX") {
    return [
      { value: "true", label: "Yes", labelAr: null },
      { value: "false", label: "No", labelAr: null },
    ];
  }
  return field.options;
}

const statusConfig: Record<ContactStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; }> = {
  IMPORTED: { label: "Imported", variant: "secondary" },
  INVITED: { label: "Invited", variant: "outline" },
  REGISTERED: { label: "Registered", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

export default function AttendeesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const { data: session } = useSession();
  const role: AppRole = getRole(session as { user?: { role?: string } } | null);
  const userCanEdit = canEdit(role);
  const userCanDelete = canDelete(role);

  // Server-paginated: `contacts` is only the current page's rows.
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 });
  const [total, setTotal] = useState(0);
  const [overallCounts, setOverallCounts] = useState<StatusCounts>({ IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 });
  const [overallTotal, setOverallTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [postRegPhases, setPostRegPhases] = useState<PostRegPhase[]>([]);

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [badgeEmailFilter, setBadgeEmailFilter] = useState<string>("ALL");
  // Combined phase filter: "ALL" or "<phaseId>:<submitted|notSubmitted>".
  // One control instead of two dropdowns keeps the toolbar tight.
  const [phaseFilter, setPhaseFilter] = useState<string>(() => {
    const phase = searchParams.get("phase");
    const phaseStatus = searchParams.get("phaseStatus");
    return phase && phaseStatus ? `${phase}:${phaseStatus}` : "ALL";
  });
  // Stage 5: a separate option filter set via deep-link from the
  // statistics page (?phase=X&option=Y). The page doesn't expose an
  // option dropdown — entering this filter only happens via deep-link
  // from the stats expand or the per-option CSV row.
  const [optionFilterPhaseId, setOptionFilterPhaseId] = useState<string | null>(
    () => {
      const phase = searchParams.get("phase");
      const option = searchParams.get("option");
      return phase && option ? phase : null;
    }
  );
  const [optionFilterOptionId, setOptionFilterOptionId] = useState<string | null>(
    () => searchParams.get("option")
  );
  // Dynamic per-form-field filters: { fieldName: selectedValue }. Only
  // fields present in filterableFields can appear here — the server
  // validates the same way, so a stale key is just ignored.
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [filterableFields, setFilterableFields] = useState<FilterableField[]>([]);
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
  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    categoryFilter,
    badgeEmailFilter,
    phaseFilter,
    optionFilterPhaseId,
    optionFilterOptionId,
    debouncedSearch,
    fieldFilters,
    emailedSort,
  ]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Single source for the filter query string — used by the list fetch
  // AND the export buttons, so the exported file always matches exactly
  // what's on screen.
  const buildFilterParams = useCallback(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    if (categoryFilter !== "ALL") p.set("category", categoryFilter);
    if (badgeEmailFilter !== "ALL") p.set("badgeEmail", badgeEmailFilter);
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (phaseFilter !== "ALL") {
      const [phaseId, phaseStatus] = phaseFilter.split(":");
      if (phaseId && phaseStatus) {
        p.set("phase", phaseId);
        p.set("phaseStatus", phaseStatus);
      }
    }
    if (optionFilterPhaseId && optionFilterOptionId) {
      // Option filter shares the `phase` param with the
      // phase-status filter above. When both are set, the
      // phase-status filter wins for the phase param value; the
      // option clause is added by the server as an AND so both
      // narrow the result set independently.
      p.set("phase", optionFilterPhaseId);
      p.set("option", optionFilterOptionId);
    }
    if (Object.keys(fieldFilters).length > 0) {
      p.set("fieldFilters", JSON.stringify(fieldFilters));
    }
    return p;
  }, [
    statusFilter,
    categoryFilter,
    badgeEmailFilter,
    phaseFilter,
    optionFilterPhaseId,
    optionFilterOptionId,
    debouncedSearch,
    fieldFilters,
  ]);

  // Meta (event/templates/phases) is fetched once; filter changes only
  // refetch the page slice. Guarded by a sequence counter so a slow
  // earlier response can never overwrite a newer one (filter + page
  // changes can put two fetches in flight).
  const metaLoadedRef = useRef(false);
  const fetchSeqRef = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setListLoading(true);
    try {
      const p = buildFilterParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (emailedSort !== "none") {
        p.set("sort", emailedSort === "yes" ? "emailed_yes" : "emailed_no");
      }
      if (!metaLoadedRef.current) p.set("includeMeta", "1");
      const res = await fetch(`/api/events/${eventId}/attendees?${p}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (seq !== fetchSeqRef.current) return; // stale response — newer fetch in flight
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setStatusCounts(data.statusCounts || { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 });
      setOverallCounts(data.overallCounts || data.statusCounts || { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 });
      setOverallTotal(data.overallTotal || data.total || 0);
      setFilterableFields(data.filterableFields || []);
      if (data.event) {
        setEvent(data.event);
        setTemplates(data.templates || []);
        setPostRegPhases(data.postRegPhases || []);
        metaLoadedRef.current = true;
      }
    } catch {
      if (seq !== fetchSeqRef.current) return;
      setContacts([]);
      toast.error("Failed to load attendees");
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setListLoading(false);
      }
    }
  }, [eventId, buildFilterParams, page, pageSize, emailedSort]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // If a filter change shrank the result set below the current page,
  // snap back to page 1 (e.g. deleting the last row of the last page).
  useEffect(() => {
    if (!listLoading && page > 1 && contacts.length === 0 && total > 0) {
      setPage(1);
    }
  }, [listLoading, page, contacts.length, total]);

  function setFieldFilter(name: string, value: string) {
    setFieldFilters((prev) => {
      const next = { ...prev };
      if (value === "ANY") delete next[name];
      else next[name] = value;
      return next;
    });
    setSelectedIds(new Set());
  }

  function clearFieldFilters() {
    setFieldFilters({});
    setSelectedIds(new Set());
  }

  function toggleContact(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function togglePageSelection() {
    const pageIds = contacts.map((c) => c.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    if (allPageSelected) {
      const next = new Set(selectedIds);
      pageIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([...selectedIds, ...pageIds]));
    }
  }

  // "Select all N attendees" across every page of the current filter —
  // the client only holds one page, so fetch just the matching ids.
  async function selectAllAttendees() {
    try {
      const p = buildFilterParams();
      p.set("idsOnly", "1");
      const res = await fetch(`/api/events/${eventId}/attendees?${p}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSelectedIds(new Set<string>(data.ids || []));
    } catch {
      toast.error("Failed to select all attendees");
    }
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
      const skipped = result.skippedCount ?? 0;
      toast.success(
        `Sent ${result.sentCount} · Failed ${result.failedCount} · Skipped ${skipped}${
          skipped > 0 ? " (no email)" : ""
        }`
      );
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

    // One bulk request — the old per-contact loop meant thousands of
    // sequential DELETEs on large selections.
    try {
      const res = await fetch(`/api/events/${eventId}/contacts/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to delete attendees");
        return;
      }
      const result = await res.json();
      toast.success(`Deleted ${result.deletedCount} attendee(s)`);
      setSelectedIds(new Set());
      fetchData();
    } catch {
      toast.error("Failed to delete attendees");
    }
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
    // Stage 2: switched from the contacts/export route to the
    // generalized registrations/export. The old route only emitted
    // Contact columns, missing every FormField column on the form (a
    // pre-existing UI/route mismatch that masked itself because admins
    // still got a CSV — just a narrow one). The registrations route
    // emits the same Contact columns plus one column per FormField,
    // ordered by FormField.order, and carries the Stage 2 FILE-field
    // filename stub.
    //
    // Side effect of switching: only REGISTERED contacts appear in the
    // CSV — IMPORTED/INVITED contacts who never registered no longer
    // show up. Reasonable on an "Attendees" page; if the broader list
    // is needed, contacts/export still exists but is no longer wired
    // to any UI button.
    //
    // The export carries the page's active filters (status, category,
    // search, badge, phase, dynamic form-answer filters) so the file
    // matches what's on screen. No filters → full dump, as before.
    const p = buildFilterParams();
    p.set("format", "csv");
    window.open(`/api/events/${eventId}/registrations/export?${p}`, "_blank");
  }

  function handleExportExcel() {
    // Same data as the CSV export, but as a real .xlsx where each FILE
    // field's cell is a clickable link to the admin-auth-gated stream
    // route (opens only for a logged-in admin; not publicly reachable).
    const p = buildFilterParams();
    p.set("format", "xlsx");
    window.open(`/api/events/${eventId}/registrations/export?${p}`, "_blank");
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  // When a specific category is selected, the Category column is hidden.
  const isSingleCategory = categoryFilter !== "ALL";

  // Server-side pagination: `contacts` is already the sorted page slice,
  // `total`/`totalPages` come from the DB aggregate.
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedContacts = contacts;
  const pageContactIds = paginatedContacts.map((c) => c.id);
  const allPageSelected = pageContactIds.length > 0 && pageContactIds.every((id) => selectedIds.has(id));
  const allSelected = total > 0 && selectedIds.size >= total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Attendees" description={`${overallTotal} total invitees`}>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        <Button variant="outline" onClick={handleExportExcel}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export as Excel
        </Button>

        {userCanEdit && <Dialog open={importOpen} onOpenChange={setImportOpen}>
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
        </Dialog>}

        {userCanEdit && <Dialog open={addOpen} onOpenChange={setAddOpen}>
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
        </Dialog>}
      </PageHeader>

      {/* Quick Stats Bar */}
      <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" /> <strong>{overallTotal}</strong> Total Contacts</span>
          <span className="text-muted-foreground/30">|</span>
          <span className="flex items-center gap-1.5 text-blue-600"><Upload className="h-4 w-4" /> <strong>{overallCounts.IMPORTED}</strong> Imported</span>
          <span className="flex items-center gap-1.5 text-yellow-600"><Clock className="h-4 w-4" /> <strong>{overallCounts.INVITED}</strong> Invited</span>
          <span className="flex items-center gap-1.5 text-green-600"><UserCheck className="h-4 w-4" /> <strong>{overallCounts.REGISTERED}</strong> Registered</span>
        </div>
        <Link href={`/dashboard/events/${eventId}/statistics`} className="ml-auto shrink-0">
          <Button variant="outline" size="sm">
            <BarChart3 className="mr-2 h-4 w-4" />
            Statistics
          </Button>
        </Link>
      </div>

      {/* Stage 5 option-filter chip — visible only when deep-linked */}
      {/* from the statistics page (?phase=X&option=Y). Single chip with */}
      {/* an × that clears both params from the URL via the state setter. */}
      {optionFilterPhaseId && optionFilterOptionId && (() => {
        const phase = postRegPhases.find(
          (p) => p.id === optionFilterPhaseId
        );
        const option = phase?.options?.find(
          (o) => o.id === optionFilterOptionId
        );
        return (
          <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Filtered:</span>
            <span className="font-medium">
              {phase?.title ?? "phase"} → {option?.label ?? "option"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              onClick={() => {
                setOptionFilterPhaseId(null);
                setOptionFilterOptionId(null);
                // Strip the URL params so a refresh keeps the cleared
                // state — otherwise the deep-link would re-apply.
                const u = new URL(window.location.href);
                u.searchParams.delete("phase");
                u.searchParams.delete("option");
                window.history.replaceState(
                  null,
                  "",
                  u.pathname + (u.search ? `?${u.searchParams}` : "")
                );
              }}
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Clear filter</span>
            </Button>
          </div>
        );
      })()}

      {/* Active form-answer filter chips — one per field, individually
          removable. Lives outside the popover so the admin always sees
          what's narrowing the list without opening Filters. */}
      {Object.keys(fieldFilters).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Filtered:</span>
          {Object.entries(fieldFilters).map(([name, value]) => {
            const field = filterableFields.find((f) => f.name === name);
            const option = field
              ? fieldFilterOptions(field).find((o) => o.value === value)
              : undefined;
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5"
              >
                <span className="text-muted-foreground">
                  {field?.label ?? name}:
                </span>
                <span className="font-medium">{option?.label ?? value}</span>
                <button
                  type="button"
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setFieldFilter(name, "ANY")}
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {field?.label ?? name} filter</span>
                </button>
              </span>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={clearFieldFilters}
          >
            Clear all
          </Button>
        </div>
      )}

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

        <Select
          value={badgeEmailFilter}
          onValueChange={(v) => { setBadgeEmailFilter(v); setSelectedIds(new Set()); }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Badge email" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Badge Status</SelectItem>
            <SelectItem value="sent">Badge Sent</SelectItem>
            <SelectItem value="not_sent">Badge Not Sent</SelectItem>
          </SelectContent>
        </Select>

        {postRegPhases.length > 0 && (
          <Select
            value={phaseFilter}
            onValueChange={(v) => { setPhaseFilter(v); setSelectedIds(new Set()); }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Phase status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Phases</SelectItem>
              {postRegPhases.map((p) => [
                <SelectItem key={`${p.id}-sub`} value={`${p.id}:submitted`}>
                  {p.title} — Submitted
                </SelectItem>,
                <SelectItem key={`${p.id}-pen`} value={`${p.id}:notSubmitted`}>
                  {p.title} — Pending
                </SelectItem>,
              ])}
            </SelectContent>
          </Select>
        )}

        {filterableFields.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {Object.keys(fieldFilters).length > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                    {Object.keys(fieldFilters).length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm font-medium">Filter by form answers</span>
                {Object.keys(fieldFilters).length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={clearFieldFilters}
                  >
                    Clear all
                  </Button>
                )}
              </div>
              <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4">
                {filterableFields.map((f) => (
                  <div key={f.name} className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {f.label}
                    </Label>
                    <Select
                      value={fieldFilters[f.name] ?? "ANY"}
                      onValueChange={(v) => setFieldFilter(f.name, v)}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ANY">Any</SelectItem>
                        {fieldFilterOptions(f).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

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
          {userCanDelete && (
            <Button
              variant="outline"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
          {userCanEdit && (
            <Button
              variant="outline"
              disabled={selectedIds.size === 0 || sending}
              onClick={openEmailDialog}
            >
              <Mail className="mr-2 h-4 w-4" />
              {sending ? "Sending..." : "Send Email"}
            </Button>
          )}
        </div>
      </div>

      {/* Send Email Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Email to {selectedIds.size} attendee{selectedIds.size !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* With server pagination the client only holds one page of
                contacts, so a precise synthetic-email count isn't known
                up front — the send endpoint skips them and reports the
                exact skipped count in the result toast. */}
            <p className="text-xs text-muted-foreground">
              Recipients without an email address are skipped automatically.
            </p>
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
      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No attendees found. Import contacts or add them manually.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={togglePageSelection}
                      title="Select this page"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Organization</th>
                  {!isSingleCategory && <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Category</th>}
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    <button
                      onClick={() => setEmailedSort(emailedSort === "none" ? "yes" : emailedSort === "yes" ? "no" : "none")}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors uppercase tracking-wider"
                      title={emailedSort === "none" ? "Sort by emailed" : emailedSort === "yes" ? "Emailed first → Not emailed first" : "Clear sort"}
                    >
                      Emailed
                      <ArrowUpDown className={`h-3 w-3 ${emailedSort !== "none" ? "text-primary" : "text-muted-foreground/50"}`} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Invited</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Registered</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Badge</th>
                  <th className="w-20 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className={listLoading ? "divide-y opacity-50 transition-opacity" : "divide-y transition-opacity"}>
                {paginatedContacts.map((contact) => (
                  <tr key={contact.id} className={`hover:bg-muted/40 transition-colors ${selectedIds.has(contact.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => toggleContact(contact.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/events/${eventId}/attendees/${contact.id}`} className="hover:underline text-primary font-medium">
                        {fallbackName(contact.firstName, contact.lastName, contact.registration?.confirmationCode)}
                      </Link>
                      <p className="text-xs text-muted-foreground md:hidden">
                        {isSyntheticEmail(contact.email) ? "—" : contact.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {isSyntheticEmail(contact.email) ? "—" : contact.email}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contact.organization || "-"}</td>
                    {!isSingleCategory && (
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{contact.category || "Uncategorized"}</Badge>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Badge variant={statusConfig[contact.status]?.variant || "secondary"} className="text-xs">
                        {statusConfig[contact.status]?.label || contact.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {contact.emailLogs && contact.emailLogs.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-green-600">
                          <span className="h-2 w-2 rounded-full bg-green-500"></span>
                          <span className="text-xs font-medium">Sent</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
                          <span className="text-xs">No</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {contact.emailLogs && contact.emailLogs.length > 0 && contact.emailLogs[0].sentAt
                        ? new Date(contact.emailLogs[0].sentAt).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {contact.registration?.registeredAt
                        ? new Date(contact.registration.registeredAt).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {contact.registration?.badgeEmailSent ? (
                        <span className="inline-flex items-center gap-1.5 text-green-600">
                          <Award className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">Sent</span>
                        </span>
                      ) : contact.registration ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 [tr:hover_&]:opacity-100 transition-opacity">
                        {userCanEdit && (
                          <button onClick={() => openEditDialog(contact)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit attendee">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {userCanDelete && (
                          <button onClick={() => handleDeleteContact(contact.id)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors" title="Delete attendee">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Select all banner */}
          {allPageSelected && !allSelected && total > pageSize && (
            <div className="px-4 py-2 border-t bg-blue-50 dark:bg-blue-950/30 text-sm text-center">
              All {paginatedContacts.length} attendees on this page are selected.{" "}
              <button onClick={selectAllAttendees} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                Select all {total} attendees
              </button>
            </div>
          )}
          {allSelected && total > pageSize && (
            <div className="px-4 py-2 border-t bg-blue-50 dark:bg-blue-950/30 text-sm text-center">
              All {selectedIds.size} attendees are selected.{" "}
              <button onClick={clearSelection} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                Clear selection
              </button>
            </div>
          )}

          {/* Pagination footer */}
          <div className="px-4 py-3 border-t bg-muted/20 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{total} attendee{total !== 1 ? "s" : ""}</span>
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
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {total === 0 ? "0" : `${startIdx + 1}–${Math.min(startIdx + paginatedContacts.length, total)}`} of {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1 || listLoading}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages || listLoading}
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
