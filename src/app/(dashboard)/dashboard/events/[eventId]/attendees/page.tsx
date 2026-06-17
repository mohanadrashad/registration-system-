"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { isSyntheticEmail, fallbackName } from "@/components/attendee/field-display";
import { FilterMultiSelect } from "@/components/attendee/filter-multi-select";
import { ColumnsMenu, type ManageableColumn } from "@/components/attendee/columns-menu";
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
  ArrowUp,
  ArrowDown,
  Award,
  Filter,
  X,
  FileSpreadsheet,
  Tags,
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
  // Pre-formatted registration form answers, keyed by FormField.name. Only
  // non-empty answers are present; the server formats them to match export.
  formValues?: Record<string, string>;
  // Attendee Group value label(s), keyed by group id (joined per group).
  groupValues?: Record<string, string>;
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

// Attendee groups, lazy-fetched for the bulk-assign dialog.
interface BulkGroup {
  id: string;
  name: string;
  allowMultiple: boolean;
  values: { id: string; label: string }[];
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

// Numbered-pager model: first, last, and a window around the current
// page, with "…" for gaps — e.g. 1 … 4 [5] 6 … 20.
function pageNumbers(current: number, totalPages: number): (number | "ellipsis")[] {
  const candidates = new Set<number>([
    1,
    totalPages,
    current - 1,
    current,
    current + 1,
  ]);
  const sorted = [...candidates]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push("ellipsis");
    out.push(n);
    prev = n;
  }
  return out;
}

const statusConfig: Record<ContactStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; }> = {
  IMPORTED: { label: "Imported", variant: "secondary" },
  INVITED: { label: "Invited", variant: "outline" },
  REGISTERED: { label: "Registered", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

// User-manageable table columns (show/hide + reorder), in default order.
// The select checkbox, Name, and the row-actions column are structural and
// not part of this list — Name is always shown first. Persisted per-event in
// localStorage; see the column state in AttendeesPage. The "Category" column
// is additionally suppressed when the list is already filtered to a single
// category (isSingleCategory), matching the long-standing behavior.
const MANAGEABLE_COLUMNS: ManageableColumn[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "organization", label: "Organization" },
  { key: "designation", label: "Designation" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
  { key: "emailed", label: "Emailed" },
  { key: "invited", label: "Invited" },
  { key: "registered", label: "Registered" },
  { key: "confirmationCode", label: "Confirmation code" },
  { key: "badge", label: "Badge" },
];
const DEFAULT_COLUMN_ORDER = MANAGEABLE_COLUMNS.map((c) => c.key);
const MANAGEABLE_KEYS = new Set(DEFAULT_COLUMN_ORDER);
// Columns shown only when an admin opts in — kept off by default so the
// table stays compact and adding them never widens an existing layout.
const DEFAULT_HIDDEN = new Set(["phone", "designation", "confirmationCode"]);
const columnStorageKey = (eventId: string) => `attendees:columns:${eventId}`;

// Registration form-answer columns are dynamic (per event) and namespaced so
// their keys can't collide with the built-in column keys above. They are
// always opt-in (hidden until the admin ticks them).
const FORM_COLUMN_PREFIX = "form:";
const GROUP_COLUMN_PREFIX = "group:";
const formColumnKey = (name: string) => `${FORM_COLUMN_PREFIX}${name}`;
const groupColumnKey = (id: string) => `${GROUP_COLUMN_PREFIX}${id}`;
const isDynamicColumnKey = (k: string) =>
  k.startsWith(FORM_COLUMN_PREFIX) || k.startsWith(GROUP_COLUMN_PREFIX);
// A persisted layout may reference a built-in key or a dynamic (form / group)
// key; dynamic keys are validated against the event's actual fields/groups
// later (at render).
const isPersistedColumnKey = (k: unknown): k is string =>
  typeof k === "string" && (MANAGEABLE_KEYS.has(k) || isDynamicColumnKey(k));

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
  // Single active sort across the table. The server takes one `sort`
  // param, so the Registered and Emailed column headers are mutually
  // exclusive sorters. "registered_desc" is the default (newest first)
  // and maps to no `sort` param — see the API route's orderBy.
  const [sort, setSort] = useState<
    "registered_desc" | "registered_asc" | "emailed_yes" | "emailed_no"
  >(() => {
    const s = searchParams.get("sort");
    return s === "registered_asc"
      ? "registered_asc"
      : s === "emailed_yes"
      ? "emailed_yes"
      : s === "emailed_no"
      ? "emailed_no"
      : "registered_desc";
  });

  // The event's registration form-answer columns (name + display label),
  // loaded once with meta. Values ride on each contact's `formValues`.
  const [formColumns, setFormColumns] = useState<{ name: string; label: string }[]>([]);
  // Custom Attendee Group columns (id + name); values ride on `groupValues`.
  const [groupColumns, setGroupColumns] = useState<{ id: string; name: string }[]>([]);

  // Column show/hide + order. Defaults render on first paint (matches the
  // server HTML, so no hydration mismatch); the user's saved layout loads
  // from localStorage on mount and is persisted only on explicit user
  // actions (never from the load itself, so the load can't be clobbered).
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => [...DEFAULT_HIDDEN]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(columnStorageKey(eventId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { order?: unknown; hidden?: unknown };

      const savedOrder = Array.isArray(parsed.order)
        ? parsed.order.filter(isPersistedColumnKey)
        : [];
      // Append built-in columns added since the layout was saved; form
      // columns are materialized separately once their definitions arrive.
      const newBuiltins = DEFAULT_COLUMN_ORDER.filter((k) => !savedOrder.includes(k));
      if (savedOrder.length > 0) setColumnOrder([...savedOrder, ...newBuiltins]);

      const savedHidden = Array.isArray(parsed.hidden)
        ? parsed.hidden.filter(isPersistedColumnKey)
        : [];
      const newlyHidden = newBuiltins.filter((k) => DEFAULT_HIDDEN.has(k));
      setHiddenColumns([...new Set([...savedHidden, ...newlyHidden])]);
    } catch {
      // ignore malformed/unavailable storage — fall back to defaults
    }
  }, [eventId]);

  // Materialize dynamic (form-answer + group) columns once their definitions
  // load: append any not yet in the order and default the newly-discovered
  // ones to hidden. A dynamic column the admin previously revealed stays in
  // the saved order, so it isn't re-hidden. State only — persisted on the
  // next user action.
  useEffect(() => {
    const dynamicKeys = [
      ...formColumns.map((f) => formColumnKey(f.name)),
      ...groupColumns.map((g) => groupColumnKey(g.id)),
    ];
    if (dynamicKeys.length === 0) return;
    const known = new Set(columnOrder);
    const missing = dynamicKeys.filter((k) => !known.has(k));
    if (missing.length === 0) return;
    setColumnOrder((prev) => [...prev, ...missing]);
    setHiddenColumns((prev) => {
      const toHide = missing.filter((k) => !prev.includes(k));
      return toHide.length ? [...prev, ...toHide] : prev;
    });
  }, [formColumns, groupColumns, columnOrder]);

  const persistColumns = useCallback(
    (order: string[], hidden: string[]) => {
      try {
        localStorage.setItem(
          columnStorageKey(eventId),
          JSON.stringify({ order, hidden })
        );
      } catch {
        // ignore — storage may be unavailable (private mode, quota)
      }
    },
    [eventId]
  );

  // All manageable columns = built-ins + form-answer columns + group columns.
  const allManageable = useMemo<ManageableColumn[]>(
    () => [
      ...MANAGEABLE_COLUMNS,
      ...formColumns.map((f) => ({ key: formColumnKey(f.name), label: f.label })),
      ...groupColumns.map((g) => ({ key: groupColumnKey(g.id), label: g.name })),
    ],
    [formColumns, groupColumns]
  );
  const allColumnKeys = useMemo(
    () => new Set(allManageable.map((c) => c.key)),
    [allManageable]
  );
  const labelByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of allManageable) m[c.key] = c.label;
    return m;
  }, [allManageable]);
  // Persisted order limited to columns that still exist, with any built-in
  // not yet present appended (form columns enter via the reconcile effect).
  const effectiveOrder = useMemo(() => {
    const valid = columnOrder.filter((k) => allColumnKeys.has(k));
    const missingBuiltins = DEFAULT_COLUMN_ORDER.filter((k) => !columnOrder.includes(k));
    return [...valid, ...missingBuiltins];
  }, [columnOrder, allColumnKeys]);
  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);

  const handleColumnReorder = useCallback(
    (newSubsetOrder: string[]) => {
      // The menu may show only a subset (e.g. Category is hidden when the
      // list is filtered to one category). Splice the reordered subset back
      // into the full order, leaving any excluded keys in their slots so
      // they aren't dropped from the saved layout.
      const subset = new Set(newSubsetOrder);
      let i = 0;
      const merged = effectiveOrder.map((k) => (subset.has(k) ? newSubsetOrder[i++] : k));
      setColumnOrder(merged);
      persistColumns(merged, hiddenColumns);
    },
    [effectiveOrder, hiddenColumns, persistColumns]
  );

  const handleColumnToggle = useCallback(
    (key: string) => {
      setHiddenColumns((prev) => {
        const next = prev.includes(key)
          ? prev.filter((k) => k !== key)
          : [...prev, key];
        persistColumns(columnOrder, next);
        return next;
      });
    },
    [columnOrder, persistColumns]
  );

  const handleColumnReset = useCallback(() => {
    // Restore built-ins to default and return dynamic (form + group) columns
    // to appended + hidden.
    const dynamicKeys = [
      ...formColumns.map((f) => formColumnKey(f.name)),
      ...groupColumns.map((g) => groupColumnKey(g.id)),
    ];
    const order = [...DEFAULT_COLUMN_ORDER, ...dynamicKeys];
    const hidden = [...DEFAULT_HIDDEN, ...dynamicKeys];
    setColumnOrder(order);
    setHiddenColumns(hidden);
    persistColumns(order, hidden);
  }, [formColumns, groupColumns, persistColumns]);

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  // Bulk group-assign dialog. Groups are lazy-fetched when it opens (they
  // aren't needed for the rest of the page).
  const [groupAssignOpen, setGroupAssignOpen] = useState(false);
  const [gaGroups, setGaGroups] = useState<BulkGroup[]>([]);
  const [gaGroupId, setGaGroupId] = useState<string>("");
  const [gaValueId, setGaValueId] = useState<string>("");
  const [gaMode, setGaMode] = useState<"set" | "add" | "remove">("set");
  const [gaApplying, setGaApplying] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState<string>("");
  const [editStatusValue, setEditStatusValue] = useState<string>("");

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

  // ── Bulk group-assign ───────────────────────────────────────────────
  async function openGroupAssign() {
    if (selectedIds.size === 0) {
      toast.error("No attendees selected");
      return;
    }
    setGroupAssignOpen(true);
    // Lazy-load groups the first time.
    if (gaGroups.length === 0) {
      try {
        const res = await fetch(`/api/events/${eventId}/groups`);
        if (res.ok) {
          const data: BulkGroup[] = await res.json();
          setGaGroups(data);
        } else {
          toast.error("Failed to load groups");
        }
      } catch {
        toast.error("Failed to load groups");
      }
    }
  }

  function onGroupAssignGroupChange(groupId: string) {
    setGaGroupId(groupId);
    setGaValueId("");
    // Single-value groups default to "Set"; multi-value to "Add".
    const g = gaGroups.find((x) => x.id === groupId);
    setGaMode(g && g.allowMultiple ? "add" : "set");
  }

  async function applyGroupAssign() {
    if (!gaGroupId || !gaValueId) {
      toast.error("Pick a group and a value");
      return;
    }
    setGaApplying(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/groups/${gaGroupId}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactIds: Array.from(selectedIds),
            valueId: gaValueId,
            mode: gaMode,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update attendees");
        return;
      }
      const result = await res.json();
      const verb =
        gaMode === "remove" ? "Removed from" : "Applied to";
      toast.success(`${verb} ${result.affected} attendee(s)`);
      setGroupAssignOpen(false);
      setGaGroupId("");
      setGaValueId("");
      // No list refetch: group values aren't shown in the table (Stage 3),
      // so there's nothing on-screen to refresh — and skipping it avoids
      // any dialog-close/refetch commit race.
    } catch {
      toast.error("Failed to update attendees");
    } finally {
      setGaApplying(false);
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

    if (!formData.get("category") && categoryFilters.length === 1) {
      formData.set("category", categoryFilters[0]);
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

  // When exactly one category is selected, every row is that category, so
  // the Category column is hidden. A single selected category also pre-fills
  // the add/import dialogs.
  const isSingleCategory = categoryFilters.length === 1;
  const singleSelectedCategory = isSingleCategory ? categoryFilters[0] : undefined;

  // Server-side pagination: `contacts` is already the sorted page slice,
  // `total`/`totalPages` come from the DB aggregate.
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedContacts = contacts;
  const pageContactIds = paginatedContacts.map((c) => c.id);
  const allPageSelected = pageContactIds.length > 0 && pageContactIds.every((id) => selectedIds.has(id));
  const allSelected = total > 0 && selectedIds.size >= total;

  // Per-column header + cell renderers. The select checkbox, Name, and the
  // row-actions column are rendered structurally outside this map (Name is
  // always first); everything here is show/hide-able and reorderable. NOTE:
  // the "Invited" column shows the date the last email was sent
  // (emailLogs[0].sentAt) — preserved as-is from the original table.
  const columnDefs: Record<
    string,
    { header: ReactNode; cell: (c: Contact) => ReactNode; tdClassName: string }
  > = {
    email: {
      header: "Email",
      tdClassName: "px-4 py-3 text-muted-foreground hidden md:table-cell",
      cell: (c) => (isSyntheticEmail(c.email) ? "—" : c.email),
    },
    phone: {
      header: "Phone",
      tdClassName: "px-4 py-3 text-muted-foreground whitespace-nowrap",
      cell: (c) => c.phone || "-",
    },
    organization: {
      header: "Organization",
      tdClassName: "px-4 py-3 text-muted-foreground",
      cell: (c) => c.organization || "-",
    },
    designation: {
      header: "Designation",
      tdClassName: "px-4 py-3 text-muted-foreground",
      cell: (c) => c.designation || "-",
    },
    category: {
      header: "Category",
      tdClassName: "px-4 py-3",
      cell: (c) => (
        <Badge variant="outline" className="text-xs">
          {c.category || "Uncategorized"}
        </Badge>
      ),
    },
    status: {
      header: "Status",
      tdClassName: "px-4 py-3",
      cell: (c) => (
        <Badge variant={statusConfig[c.status]?.variant || "secondary"} className="text-xs">
          {statusConfig[c.status]?.label || c.status}
        </Badge>
      ),
    },
    emailed: {
      header: (
        <button
          onClick={() => setSort(sort === "emailed_yes" ? "emailed_no" : sort === "emailed_no" ? "registered_desc" : "emailed_yes")}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors uppercase tracking-wider"
          title={sort === "emailed_yes" ? "Emailed first → Not emailed first" : sort === "emailed_no" ? "Clear sort" : "Sort by emailed"}
        >
          Emailed
          <ArrowUpDown className={`h-3 w-3 ${sort === "emailed_yes" || sort === "emailed_no" ? "text-primary" : "text-muted-foreground/50"}`} />
        </button>
      ),
      tdClassName: "px-4 py-3",
      cell: (c) =>
        c.emailLogs && c.emailLogs.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-green-600">
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            <span className="text-xs font-medium">Sent</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
            <span className="text-xs">No</span>
          </span>
        ),
    },
    invited: {
      header: "Invited",
      tdClassName: "px-4 py-3 text-xs text-muted-foreground whitespace-nowrap",
      cell: (c) =>
        c.emailLogs && c.emailLogs.length > 0 && c.emailLogs[0].sentAt
          ? new Date(c.emailLogs[0].sentAt).toLocaleDateString()
          : "-",
    },
    registered: {
      header: (
        <button
          onClick={() => setSort(sort === "registered_asc" ? "registered_desc" : "registered_asc")}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors uppercase tracking-wider"
          title={sort === "registered_asc" ? "Oldest first → Newest first" : "Newest first → Oldest first"}
        >
          Registered
          {sort === "registered_asc" ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : sort === "registered_desc" ? (
            <ArrowDown className="h-3 w-3 text-primary" />
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
          )}
        </button>
      ),
      tdClassName: "px-4 py-3 text-xs text-muted-foreground whitespace-nowrap",
      cell: (c) =>
        c.registration?.registeredAt
          ? new Date(c.registration.registeredAt).toLocaleDateString()
          : "-",
    },
    confirmationCode: {
      header: "Code",
      tdClassName: "px-4 py-3 text-xs text-muted-foreground whitespace-nowrap",
      cell: (c) => c.registration?.confirmationCode || "-",
    },
    badge: {
      header: "Badge",
      tdClassName: "px-4 py-3",
      cell: (c) =>
        c.registration?.badgeEmailSent ? (
          <span className="inline-flex items-center gap-1.5 text-green-600">
            <Award className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Sent</span>
          </span>
        ) : c.registration ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : null,
    },
  };

  const thBaseClass =
    "text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground";

  // A dynamic (form-answer or group) column: a truncated header + a cell that
  // shows a pre-formatted display string with a tooltip for the full value.
  const dynamicColumnDef = (
    label: string,
    getValue: (c: Contact) => string | undefined
  ): { header: ReactNode; cell: (c: Contact) => ReactNode; tdClassName: string } => ({
    header: (
      <span className="block max-w-[12rem] truncate" title={label}>
        {label}
      </span>
    ),
    tdClassName: "px-4 py-3 text-muted-foreground",
    cell: (c) => {
      const v = getValue(c);
      return v ? (
        <span className="block max-w-[14rem] truncate" title={v}>
          {v}
        </span>
      ) : (
        "-"
      );
    },
  });

  // Resolve a column key to its header + cell renderer. Built-ins come from
  // the static map above; form-answer columns render `formValues[name]` and
  // group columns render `groupValues[id]` (both server-formatted to match
  // the export).
  const getColumnDef = (
    key: string
  ): { header: ReactNode; cell: (c: Contact) => ReactNode; tdClassName: string } => {
    if (key.startsWith(FORM_COLUMN_PREFIX)) {
      const name = key.slice(FORM_COLUMN_PREFIX.length);
      return dynamicColumnDef(labelByKey[key] ?? name, (c) => c.formValues?.[name]);
    }
    if (key.startsWith(GROUP_COLUMN_PREFIX)) {
      const id = key.slice(GROUP_COLUMN_PREFIX.length);
      return dynamicColumnDef(labelByKey[key] ?? "Group", (c) => c.groupValues?.[id]);
    }
    return columnDefs[key];
  };

  // Category is suppressed when the list is already scoped to one category.
  const columnApplies = (key: string) => key !== "category" || !isSingleCategory;
  // Menu: all applicable columns in display order (hidden ones included so
  // they can be reordered / re-shown). Table: applicable + visible only.
  const menuColumns: ManageableColumn[] = effectiveOrder
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
                  <Select name="category" defaultValue={singleSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Use category from file" />
                    </SelectTrigger>
                    <SelectContent>
                      {event.categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {singleSelectedCategory && (
                    <p className="text-xs text-muted-foreground">
                      Pre-filled with current category tab: <strong>{singleSelectedCategory}</strong>
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
                  <Select name="category" defaultValue={singleSelectedCategory}>
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
                // The URL-sync effect rewrites the query string on state
                // change, so clearing state is enough — no manual strip.
                setOptionFilterPhaseId(null);
                setOptionFilterOptionId(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Clear filter</span>
            </Button>
          </div>
        );
      })()}

      {/* Active filter chips — one per SELECTED VALUE (a filter with two
          values shows two chips), individually removable. Lives outside
          the Filters panel so the admin always sees what's narrowing the
          list. */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Filtered:</span>
          {Object.entries(fieldFilters).flatMap(([name, values]) => {
            const field = filterableFields.find((f) => f.name === name);
            const opts = field ? fieldFilterOptions(field) : [];
            return values.map((value) => {
              const option = opts.find((o) => o.value === value);
              return (
                <span
                  key={`${name}:${value}`}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5"
                >
                  <span className="text-muted-foreground">
                    {field?.label ?? name}:
                  </span>
                  <span className="font-medium">{option?.label ?? value}</span>
                  <button
                    type="button"
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleFieldFilter(name, value)}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">
                      Remove {field?.label ?? name} {option?.label ?? value} filter
                    </span>
                  </button>
                </span>
              );
            });
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

      {/* Category Tabs — multi-select. Click categories to toggle them
          (several can be active = OR); "All Categories" clears them. */}
      {event?.categories && event.categories.length > 0 && (
        <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
          <button
            key="ALL"
            onClick={() => { setCategoryFilters([]); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
              categoryFilters.length === 0
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Categories
          </button>
          {event.categories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                categoryFilters.includes(cat)
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
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
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            {/* A side panel (not a popover) so long option lists have room
                and nothing gets clipped — each filter is an inline
                multi-select. */}
            <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
              <SheetHeader className="border-b">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                {(() => {
                  const formFields = filterableFields.filter(
                    (f) => f.type !== "GROUP"
                  );
                  const groupFields = filterableFields.filter(
                    (f) => f.type === "GROUP"
                  );
                  const control = (f: FilterableField) => (
                    <FilterMultiSelect
                      key={f.name}
                      label={f.label}
                      options={fieldFilterOptions(f)}
                      selected={fieldFilters[f.name] ?? []}
                      onToggle={(v) => toggleFieldFilter(f.name, v)}
                      onClear={() => clearOneFilter(f.name)}
                    />
                  );
                  return (
                    <>
                      {formFields.length > 0 && groupFields.length > 0 && (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Form answers
                        </p>
                      )}
                      {formFields.map(control)}
                      {groupFields.length > 0 && (
                        <div className="space-y-5 border-t pt-5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Groups
                          </p>
                          {groupFields.map(control)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <SheetFooter className="flex-row items-center justify-between border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFieldFilters}
                  disabled={activeFilterCount === 0}
                >
                  Clear all
                </Button>
                <SheetClose asChild>
                  <Button size="sm">Done</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
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
              disabled={selectedIds.size === 0}
              onClick={openGroupAssign}
            >
              <Tags className="mr-2 h-4 w-4" />
              Set group
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

      {/* Bulk group-assign Dialog */}
      <Dialog open={groupAssignOpen} onOpenChange={setGroupAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set group for {selectedIds.size} attendee
              {selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          {gaGroups.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No groups defined yet. Create one in Settings → Groups first.
            </p>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select value={gaGroupId} onValueChange={onGroupAssignGroupChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {gaGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(() => {
                const group = gaGroups.find((g) => g.id === gaGroupId);
                if (!group) return null;
                return (
                  <>
                    <div className="space-y-1.5">
                      <Label>Value</Label>
                      <Select value={gaValueId} onValueChange={setGaValueId}>
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
                        value={gaMode}
                        onValueChange={(v) =>
                          setGaMode(v as "set" | "add" | "remove")
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
                  onClick={() => setGroupAssignOpen(false)}
                  disabled={gaApplying}
                >
                  Cancel
                </Button>
                <Button
                  onClick={applyGroupAssign}
                  disabled={gaApplying || !gaGroupId || !gaValueId}
                >
                  {gaApplying ? "Applying…" : "Apply"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
          <div className="flex items-center justify-end border-b px-4 py-2">
            <ColumnsMenu
              columns={menuColumns}
              hidden={hiddenColumns}
              onReorder={handleColumnReorder}
              onToggle={handleColumnToggle}
              onReset={handleColumnReset}
            />
          </div>
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
                  {visibleColumns.map((key) => (
                    <th key={key} className={thBaseClass}>
                      {getColumnDef(key).header}
                    </th>
                  ))}
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
                      <Link
                        href={`/dashboard/events/${eventId}/attendees/${contact.id}`}
                        className="hover:underline text-primary font-medium"
                        onClick={rememberListPosition}
                      >
                        {fallbackName(contact.firstName, contact.lastName, contact.registration?.confirmationCode)}
                      </Link>
                      <p className="text-xs text-muted-foreground md:hidden">
                        {isSyntheticEmail(contact.email) ? "—" : contact.email}
                      </p>
                    </td>
                    {visibleColumns.map((key) => {
                      const def = getColumnDef(key);
                      return (
                        <td key={key} className={def.tdClassName}>
                          {def.cell(contact)}
                        </td>
                      );
                    })}
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
              <div className="hidden sm:flex items-center gap-1">
                {pageNumbers(safePage, totalPages).map((n, i) =>
                  n === "ellipsis" ? (
                    <span key={`e-${i}`} className="px-1 text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Button
                      key={n}
                      variant={n === safePage ? "default" : "outline"}
                      size="sm"
                      className="h-8 min-w-8 px-2"
                      disabled={listLoading}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </Button>
                  )
                )}
              </div>
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
