"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import {
  Award,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isSyntheticEmail, fallbackName } from "@/components/attendee/field-display";
import { ColumnsMenu, type ManageableColumn } from "@/components/attendee/columns-menu";
import type { Contact, AttendeesSort } from "./types";
import {
  statusConfig,
  looksLikeUrl,
  FORM_COLUMN_PREFIX,
  GROUP_COLUMN_PREFIX,
  PHASE_COLUMN_PREFIX,
} from "./columns";

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

const thBaseClass =
  "text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground";

// The attendees table card: columns menu, header (with the two sortable
// columns), rows, select-all banners, and the pagination footer. All state
// lives in the page — this component renders one server-paginated slice.
export function AttendeesTable({
  eventId,
  contacts,
  listLoading,
  total,
  totalPages,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sort,
  onSortChange,
  selectedIds,
  onToggleContact,
  onTogglePageSelection,
  onSelectAllAttendees,
  onClearSelection,
  visibleColumns,
  menuColumns,
  hiddenColumns,
  onColumnReorder,
  onColumnToggle,
  onColumnReset,
  labelByKey,
  formColumnType,
  userCanEdit,
  userCanDelete,
  onEditContact,
  onDeleteContact,
  onRememberPosition,
}: {
  eventId: string;
  contacts: Contact[];
  listLoading: boolean;
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sort: AttendeesSort;
  onSortChange: (sort: AttendeesSort) => void;
  selectedIds: Set<string>;
  onToggleContact: (id: string) => void;
  onTogglePageSelection: () => void;
  onSelectAllAttendees: () => void;
  onClearSelection: () => void;
  visibleColumns: string[];
  menuColumns: ManageableColumn[];
  hiddenColumns: string[];
  onColumnReorder: (order: string[]) => void;
  onColumnToggle: (key: string) => void;
  onColumnReset: () => void;
  labelByKey: Record<string, string>;
  formColumnType: Record<string, string>;
  userCanEdit: boolean;
  userCanDelete: boolean;
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
  onRememberPosition: () => void;
}) {
  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No attendees found. Import contacts or add them manually.
        </CardContent>
      </Card>
    );
  }

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
          onClick={() => onSortChange(sort === "emailed_yes" ? "emailed_no" : sort === "emailed_no" ? "registered_desc" : "emailed_yes")}
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
          onClick={() => onSortChange(sort === "registered_asc" ? "registered_desc" : "registered_asc")}
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

  // A dynamic (form-answer / group / phase) column: a truncated header + a
  // cell that shows the pre-formatted display string with a tooltip for the
  // full value. When `getFileId` yields an id, the value is rendered as a
  // link to the admin-auth file stream (opens inline in a new tab); otherwise
  // a value that is a bare URL becomes an external link. Everything else stays
  // plain text. This brings the file/website links to the list so admins don't
  // have to open each profile.
  const dynamicColumnDef = (
    label: string,
    getValue: (c: Contact) => string | undefined,
    getFileId?: (c: Contact) => string | undefined
  ): { header: ReactNode; cell: (c: Contact) => ReactNode; tdClassName: string } => ({
    header: (
      <span className="block max-w-[12rem] truncate" title={label}>
        {label}
      </span>
    ),
    tdClassName: "px-4 py-3 text-muted-foreground",
    cell: (c) => {
      const v = getValue(c);
      if (!v) return "-";
      const linkClass =
        "block max-w-[14rem] truncate text-primary hover:underline";
      const fileId = getFileId?.(c);
      if (fileId) {
        return (
          <a
            href={`/api/events/${eventId}/files/${fileId}/stream`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
            title={v}
          >
            {v}
          </a>
        );
      }
      const url = looksLikeUrl(v);
      if (url) {
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
            title={v}
          >
            {v}
          </a>
        );
      }
      return (
        <span className="block max-w-[14rem] truncate" title={v}>
          {v}
        </span>
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
      const isFile = formColumnType[name] === "FILE";
      return dynamicColumnDef(
        labelByKey[key] ?? name,
        (c) => c.formValues?.[name],
        isFile ? (c) => c.fileValues?.[name] : undefined
      );
    }
    if (key.startsWith(GROUP_COLUMN_PREFIX)) {
      const id = key.slice(GROUP_COLUMN_PREFIX.length);
      return dynamicColumnDef(labelByKey[key] ?? "Group", (c) => c.groupValues?.[id]);
    }
    if (key.startsWith(PHASE_COLUMN_PREFIX)) {
      // Value is keyed by the full column key (no parsing needed).
      return dynamicColumnDef(labelByKey[key] ?? "Answer", (c) => c.phaseValues?.[key]);
    }
    return columnDefs[key];
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-end border-b px-4 py-2">
        <ColumnsMenu
          columns={menuColumns}
          hidden={hiddenColumns}
          onReorder={onColumnReorder}
          onToggle={onColumnToggle}
          onReset={onColumnReset}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={onTogglePageSelection}
                  title="Select this page"
                />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">ID</th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground min-w-[220px]">Name</th>
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
                    onCheckedChange={() => onToggleContact(contact.id)}
                  />
                </td>
                <td className="px-4 py-3 text-sm font-medium text-muted-foreground tabular-nums whitespace-nowrap">
                  {contact.serialNumber ?? "—"}
                </td>
                <td className="px-4 py-3 min-w-[220px]">
                  <Link
                    href={`/dashboard/events/${eventId}/attendees/${contact.id}`}
                    className="hover:underline text-primary font-medium"
                    onClick={onRememberPosition}
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
                      <button onClick={() => onEditContact(contact)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit attendee">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                    {userCanDelete && (
                      <button onClick={() => onDeleteContact(contact.id)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors" title="Delete attendee">
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
          <button onClick={onSelectAllAttendees} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
            Select all {total} attendees
          </button>
        </div>
      )}
      {allSelected && total > pageSize && (
        <div className="px-4 py-2 border-t bg-blue-50 dark:bg-blue-950/30 text-sm text-center">
          All {selectedIds.size} attendees are selected.{" "}
          <button onClick={onClearSelection} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
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
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
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
            onClick={() => onPageChange(safePage - 1)}
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
                  onClick={() => onPageChange(n)}
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
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
