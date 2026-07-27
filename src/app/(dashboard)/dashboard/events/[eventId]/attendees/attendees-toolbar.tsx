"use client";

import { Mail, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterableField } from "@/lib/attendees/field-filter-options";
import type { PostRegPhase } from "./types";
import { FilterSheet } from "./filter-sheet";

// The filter/search/bulk-action row above the table. All state lives in the
// page; the change handlers passed in also clear the row selection, matching
// the original inline behavior.
export function AttendeesToolbar({
  statusFilter,
  onStatusFilterChange,
  badgeEmailFilter,
  onBadgeEmailFilterChange,
  phaseFilter,
  onPhaseFilterChange,
  postRegPhases,
  filterableFields,
  fieldFilters,
  activeFilterCount,
  onToggleFieldFilter,
  onClearOneFilter,
  onClearFieldFilters,
  search,
  onSearchChange,
  selectedCount,
  sending,
  userCanEdit,
  userCanDelete,
  onBulkDelete,
  onOpenGroupAssign,
  onOpenEmail,
}: {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  badgeEmailFilter: string;
  onBadgeEmailFilterChange: (value: string) => void;
  phaseFilter: string;
  onPhaseFilterChange: (value: string) => void;
  postRegPhases: PostRegPhase[];
  filterableFields: FilterableField[];
  fieldFilters: Record<string, string[]>;
  activeFilterCount: number;
  onToggleFieldFilter: (name: string, value: string) => void;
  onClearOneFilter: (name: string) => void;
  onClearFieldFilters: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedCount: number;
  sending: boolean;
  userCanEdit: boolean;
  userCanDelete: boolean;
  onBulkDelete: () => void;
  onOpenGroupAssign: () => void;
  onOpenEmail: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
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

      <Select value={badgeEmailFilter} onValueChange={onBadgeEmailFilterChange}>
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
        <Select value={phaseFilter} onValueChange={onPhaseFilterChange}>
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

      <FilterSheet
        filterableFields={filterableFields}
        fieldFilters={fieldFilters}
        activeFilterCount={activeFilterCount}
        onToggle={onToggleFieldFilter}
        onClearOne={onClearOneFilter}
        onClearAll={onClearFieldFilters}
      />

      <Input
        placeholder="Search by name, email, organization..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />

      <div className="ml-auto flex items-center gap-2">
        {selectedCount > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedCount} selected
          </span>
        )}
        {userCanDelete && (
          <Button
            variant="outline"
            disabled={selectedCount === 0}
            onClick={onBulkDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
        {userCanEdit && (
          <Button
            variant="outline"
            disabled={selectedCount === 0}
            onClick={onOpenGroupAssign}
          >
            <Tags className="mr-2 h-4 w-4" />
            Set group
          </Button>
        )}
        {userCanEdit && (
          <Button
            variant="outline"
            disabled={selectedCount === 0 || sending}
            onClick={onOpenEmail}
          >
            <Mail className="mr-2 h-4 w-4" />
            {sending ? "Sending..." : "Send Email"}
          </Button>
        )}
      </div>
    </div>
  );
}
