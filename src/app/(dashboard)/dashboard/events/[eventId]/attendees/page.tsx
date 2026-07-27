"use client";

// Attendees list — container page. Owns all list/filter/selection state and
// the data fetching; the UI is composed from the colocated pieces in this
// folder (toolbar, filters, table, dialogs) plus useColumnManager for the
// column show/hide + order state.

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getRole, canEdit, canDelete, type AppRole } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FILTER_NONE_VALUE } from "@/lib/attendees/filter-constants";
import type { FilterableField } from "@/lib/attendees/field-filter-options";
import {
  Upload,
  Download,
  Users,
  UserCheck,
  Clock,
  BarChart3,
  FileSpreadsheet,
} from "lucide-react";

import type {
  Contact,
  StatusCounts,
  Event,
  EmailTemplate,
  PostRegPhase,
  AttendeesSort,
} from "./types";
import { useColumnManager } from "./use-column-manager";
import { AttendeesToolbar } from "./attendees-toolbar";
import { AttendeesTable } from "./attendees-table";
import { CategoryTabs } from "./category-tabs";
import { ActiveFilterChips, OptionFilterChip } from "./filter-chips";
import { AddAttendeeDialog } from "./add-attendee-dialog";
import { ImportAttendeesDialog } from "./import-attendees-dialog";
import { EditAttendeeDialog } from "./edit-attendee-dialog";
import { SendEmailDialog } from "./send-email-dialog";
import { BulkGroupAssignDialog } from "./bulk-group-assign-dialog";

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

  // All filter/page state initializes from the URL and is mirrored back
  // into it (see the replaceState effect below) — so browser back,
  // refresh, and shared links restore the exact view instead of
  // resetting to defaults.
  // Multi-select category filter (empty = all). Initialized from the
  // `categories` JSON param, falling back to a legacy single `category`.
  const [categoryFilters, setCategoryFilters] = useState<string[]>(() => {
    const raw = searchParams.get("categories");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((c): c is string => typeof c === "string" && c !== "");
        }
      } catch {
        // fall through
      }
    }
    const single = searchParams.get("category");
    return single ? [single] : [];
  });
  const [statusFilter, setStatusFilter] = useState<string>(
    () => searchParams.get("status") || "ALL"
  );
  const [badgeEmailFilter, setBadgeEmailFilter] = useState<string>(
    () => searchParams.get("badge") || "ALL"
  );
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
  // Dynamic per-field filters: { fieldName: selectedValues[] }. Each filter
  // holds a LIST of values (OR within the filter). Only fields present in
  // filterableFields can appear; the server validates the same way, so a
  // stale key is ignored. A bare string from an older link is coerced to a
  // one-element array.
  const [fieldFilters, setFieldFilters] = useState<Record<string, string[]>>(() => {
    try {
      const raw = searchParams.get("ff");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const arr = Array.isArray(v) ? v : [v];
        const vals = arr.filter((x): x is string => typeof x === "string" && x !== "");
        if (vals.length) out[k] = vals;
      }
      return out;
    } catch {
      return {};
    }
  });
  const [filterableFields, setFilterableFields] = useState<FilterableField[]>([]);
  const initialSearch = searchParams.get("search") || "";
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(() =>
    Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
  );
  const [pageSize, setPageSize] = useState(() => {
    const v = parseInt(searchParams.get("pageSize") || "", 10);
    return [10, 25, 50, 100].includes(v) ? v : 10;
  });
  const [sort, setSort] = useState<AttendeesSort>(() => {
    const s = searchParams.get("sort");
    return s === "registered_asc"
      ? "registered_asc"
      : s === "emailed_yes"
      ? "emailed_yes"
      : s === "emailed_no"
      ? "emailed_no"
      : "registered_desc";
  });

  // The event's registration form-answer columns (name + display label +
  // field type), loaded once with meta. Values ride on each contact's
  // `formValues`; FILE columns also read `fileValues` for the link href.
  const [formColumns, setFormColumns] = useState<{ name: string; label: string; type: string }[]>([]);
  // Custom Attendee Group columns (id + name); values ride on `groupValues`.
  const [groupColumns, setGroupColumns] = useState<{ id: string; name: string }[]>([]);
  // Post-registration answer columns (server-built key + label); values ride
  // on each contact's `phaseValues` under the same key.
  const [phaseColumns, setPhaseColumns] = useState<{ key: string; label: string }[]>([]);

  // Column show/hide + order (persisted per-event in localStorage).
  const {
    effectiveOrder,
    hiddenColumns,
    hiddenSet,
    labelByKey,
    formColumnType,
    handleColumnReorder,
    handleColumnToggle,
    handleColumnReset,
  } = useColumnManager({ eventId, formColumns, groupColumns, phaseColumns });

  // Dialogs
  const [emailOpen, setEmailOpen] = useState(false);
  const [groupAssignOpen, setGroupAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  // Reset page when filters change. Skipped on mount — otherwise it
  // would clobber a page number restored from the URL.
  const filtersDidMountRef = useRef(false);
  useEffect(() => {
    if (!filtersDidMountRef.current) {
      filtersDidMountRef.current = true;
      return;
    }
    setPage(1);
  }, [
    statusFilter,
    categoryFilters,
    badgeEmailFilter,
    phaseFilter,
    optionFilterPhaseId,
    optionFilterOptionId,
    debouncedSearch,
    fieldFilters,
    sort,
  ]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Mirror the full view state into the URL. replaceState (not router
  // navigation) — no history spam and no re-render; each filter change
  // updates the current entry, so browser back leaves the page with the
  // view intact and refresh / shared links restore it.
  useEffect(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    if (categoryFilters.length > 0) p.set("categories", JSON.stringify(categoryFilters));
    if (badgeEmailFilter !== "ALL") p.set("badge", badgeEmailFilter);
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (phaseFilter !== "ALL") {
      const [phaseId, phaseStatus] = phaseFilter.split(":");
      if (phaseId && phaseStatus) {
        p.set("phase", phaseId);
        p.set("phaseStatus", phaseStatus);
      }
    }
    if (optionFilterPhaseId && optionFilterOptionId) {
      p.set("phase", optionFilterPhaseId);
      p.set("option", optionFilterOptionId);
    }
    if (Object.keys(fieldFilters).length > 0) {
      p.set("ff", JSON.stringify(fieldFilters));
    }
    if (page > 1) p.set("page", String(page));
    if (pageSize !== 10) p.set("pageSize", String(pageSize));
    if (sort !== "registered_desc") p.set("sort", sort);
    const qs = p.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  }, [
    statusFilter,
    categoryFilters,
    badgeEmailFilter,
    debouncedSearch,
    phaseFilter,
    optionFilterPhaseId,
    optionFilterOptionId,
    fieldFilters,
    page,
    pageSize,
    sort,
  ]);

  // Single source for the filter query string — used by the list fetch
  // AND the export buttons, so the exported file always matches exactly
  // what's on screen.
  const buildFilterParams = useCallback(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    if (categoryFilters.length > 0) p.set("categories", JSON.stringify(categoryFilters));
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
    categoryFilters,
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
      if (sort !== "registered_desc") p.set("sort", sort);
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
        setFormColumns(data.formColumns || []);
        setGroupColumns(data.groupColumns || []);
        setPhaseColumns(data.phaseColumns || []);
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
  }, [eventId, buildFilterParams, page, pageSize, sort]);

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

  // Scroll memory across the detail-page round trip: position is saved
  // when a row is clicked (rememberListPosition) and restored once after
  // the first data load. The return URL is saved alongside so the detail
  // page's Back button can come back to this exact view.
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    try {
      const saved = sessionStorage.getItem(`attendees:scroll:${eventId}`);
      if (saved) {
        sessionStorage.removeItem(`attendees:scroll:${eventId}`);
        window.scrollTo({ top: parseInt(saved, 10) || 0 });
      }
    } catch {
      // sessionStorage unavailable (private mode) — nothing to restore.
    }
  }, [loading, eventId]);

  function rememberListPosition() {
    try {
      sessionStorage.setItem(
        `attendees:return:${eventId}`,
        window.location.pathname + window.location.search
      );
      sessionStorage.setItem(`attendees:scroll:${eventId}`, String(window.scrollY));
    } catch {
      // Best-effort only.
    }
  }

  // Toggle one value within a filter (add if absent, remove if present).
  // When a filter's list empties, drop the key so the active count stays
  // accurate and the URL stays clean.
  function toggleFieldFilter(name: string, value: string) {
    setFieldFilters((prev) => {
      const next = { ...prev };
      const current = next[name] ?? [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length === 0) delete next[name];
      else next[name] = updated;
      return next;
    });
    setSelectedIds(new Set());
  }

  function clearOneFilter(name: string) {
    setFieldFilters((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSelectedIds(new Set());
  }

  function clearFieldFilters() {
    setFieldFilters({});
    setSelectedIds(new Set());
  }

  // Multi-select category: clicking a category toggles it; "All Categories"
  // (empty list) clears the filter.
  function toggleCategory(cat: string) {
    setCategoryFilters((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
    setSelectedIds(new Set());
  }

  // Total values selected across the dynamic field/group filters (badge).
  const activeFilterCount = Object.values(fieldFilters).reduce(
    (n, vals) => n + vals.length,
    0
  );

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
    setEditOpen(true);
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

  function openGroupAssign() {
    if (selectedIds.size === 0) {
      toast.error("No attendees selected");
      return;
    }
    setGroupAssignOpen(true);
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

  // When exactly one category is selected, every row is that category, so
  // the Category column is hidden. A single selected category also pre-fills
  // the add/import dialogs.
  const isSingleCategory = categoryFilters.length === 1;
  // Only a REAL single category pre-fills the add/import dialogs — the
  // Uncategorized sentinel must never be treated as a category value.
  const singleSelectedCategory =
    isSingleCategory && categoryFilters[0] !== FILTER_NONE_VALUE
      ? categoryFilters[0]
      : undefined;

  // Category is suppressed when the list is already scoped to one category.
  const columnApplies = (key: string) => key !== "category" || !isSingleCategory;
  // Menu: all applicable columns in display order (hidden ones included so
  // they can be reordered / re-shown). Table: applicable + visible only.
  const menuColumns = effectiveOrder
    .filter(columnApplies)
    .map((k) => ({ key: k, label: labelByKey[k] ?? k }));
  const visibleColumns = effectiveOrder.filter(
    (k) => columnApplies(k) && !hiddenSet.has(k)
  );

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

        {userCanEdit && (
          <ImportAttendeesDialog
            eventId={eventId}
            categories={event?.categories}
            defaultCategory={singleSelectedCategory}
            onImported={fetchData}
          />
        )}

        {userCanEdit && (
          <AddAttendeeDialog
            eventId={eventId}
            categories={event?.categories}
            defaultCategory={singleSelectedCategory}
            onAdded={fetchData}
          />
        )}
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

      <OptionFilterChip
        phaseId={optionFilterPhaseId}
        optionId={optionFilterOptionId}
        postRegPhases={postRegPhases}
        onClear={() => {
          // The URL-sync effect rewrites the query string on state
          // change, so clearing state is enough — no manual strip.
          setOptionFilterPhaseId(null);
          setOptionFilterOptionId(null);
        }}
      />

      <ActiveFilterChips
        fieldFilters={fieldFilters}
        filterableFields={filterableFields}
        onToggle={toggleFieldFilter}
        onClearAll={clearFieldFilters}
      />

      <CategoryTabs
        categories={event?.categories}
        selected={categoryFilters}
        onToggle={toggleCategory}
        onClear={() => { setCategoryFilters([]); setSelectedIds(new Set()); }}
      />

      <AttendeesToolbar
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setStatusFilter(v); setSelectedIds(new Set()); }}
        badgeEmailFilter={badgeEmailFilter}
        onBadgeEmailFilterChange={(v) => { setBadgeEmailFilter(v); setSelectedIds(new Set()); }}
        phaseFilter={phaseFilter}
        onPhaseFilterChange={(v) => { setPhaseFilter(v); setSelectedIds(new Set()); }}
        postRegPhases={postRegPhases}
        filterableFields={filterableFields}
        fieldFilters={fieldFilters}
        activeFilterCount={activeFilterCount}
        onToggleFieldFilter={toggleFieldFilter}
        onClearOneFilter={clearOneFilter}
        onClearFieldFilters={clearFieldFilters}
        search={search}
        onSearchChange={setSearch}
        selectedCount={selectedIds.size}
        sending={sending}
        userCanEdit={userCanEdit}
        userCanDelete={userCanDelete}
        onBulkDelete={handleBulkDelete}
        onOpenGroupAssign={openGroupAssign}
        onOpenEmail={openEmailDialog}
      />

      <BulkGroupAssignDialog
        open={groupAssignOpen}
        onOpenChange={setGroupAssignOpen}
        eventId={eventId}
        selectedIds={selectedIds}
      />

      <SendEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        templates={templates}
        selectedCount={selectedIds.size}
        onSend={handleSendWithTemplate}
      />

      <EditAttendeeDialog
        open={editOpen}
        onOpenChange={(open) => { setEditOpen(open); if (!open) setEditContact(null); }}
        contact={editContact}
        categories={event?.categories}
        eventId={eventId}
        onSaved={fetchData}
        onDelete={handleDeleteContact}
      />

      <AttendeesTable
        eventId={eventId}
        contacts={contacts}
        listLoading={listLoading}
        total={total}
        totalPages={totalPages}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        sort={sort}
        onSortChange={setSort}
        selectedIds={selectedIds}
        onToggleContact={toggleContact}
        onTogglePageSelection={togglePageSelection}
        onSelectAllAttendees={selectAllAttendees}
        onClearSelection={clearSelection}
        visibleColumns={visibleColumns}
        menuColumns={menuColumns}
        hiddenColumns={hiddenColumns}
        onColumnReorder={handleColumnReorder}
        onColumnToggle={handleColumnToggle}
        onColumnReset={handleColumnReset}
        labelByKey={labelByKey}
        formColumnType={formColumnType}
        userCanEdit={userCanEdit}
        userCanDelete={userCanDelete}
        onEditContact={openEditDialog}
        onDeleteContact={handleDeleteContact}
        onRememberPosition={rememberListPosition}
      />
    </div>
  );
}
