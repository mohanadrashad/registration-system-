"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";

// ─── Wire-format types ───────────────────────────────────────────────

export interface OptionStat {
  id: string;
  label: string;
  capacity: number | null;
  taken: number;
  full: boolean;
  receiptRequired: boolean;
  receiptCount: number;
}

export interface PhaseOptionStats {
  id: string;
  title: string;
  selectionMode: string;
  requiresReceiptUpload: boolean;
  options: OptionStat[];
}

interface OptionBreakdownProps {
  eventId: string;
  optionStats: PhaseOptionStats[];
}

export function OptionBreakdown({
  eventId,
  optionStats,
}: OptionBreakdownProps) {
  if (optionStats.length === 0) return null;

  return (
    <>
      <h3 className="text-lg font-semibold mt-6">Per-Option Breakdown</h3>
      <p className="text-xs text-muted-foreground -mt-3">
        Capacity and receipt status per option. Click a row to see the
        attendees who picked it.
      </p>
      <div className="space-y-4">
        {optionStats.map((p) => (
          <PhaseOptionsCard key={p.id} eventId={eventId} phase={p} />
        ))}
      </div>
    </>
  );
}

// ─── Per-phase card with expandable rows ────────────────────────────

function PhaseOptionsCard({
  eventId,
  phase,
}: {
  eventId: string;
  phase: PhaseOptionStats;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h4 className="font-semibold text-base truncate">{phase.title}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {phase.selectionMode}
              {phase.requiresReceiptUpload && " · Receipts required"}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/events/${eventId}/phases/${phase.id}/selections?format=csv`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              CSV
            </a>
          </Button>
        </div>

        <div className="space-y-1.5">
          {phase.options.map((opt) => (
            <OptionRow
              key={opt.id}
              eventId={eventId}
              phaseId={phase.id}
              option={opt}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Per-option row + lazy-loaded attendee expansion ────────────────

interface AttendeeRow {
  id: string;
  registrationId: string;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  source: "ADMIN_ASSIGNED" | "ATTENDEE_PICKED";
  assignedAt: string;
  hasReceipt: boolean;
  receipt: { id: string; originalName: string } | null;
}

function OptionRow({
  eventId,
  phaseId,
  option,
}: {
  eventId: string;
  phaseId: string;
  option: OptionStat;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<AttendeeRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Capacity bar fill — clamped to 100% visually even when over-cap so
  // the bar doesn't overflow. The numeric label below tells the truth.
  const capacityPct =
    option.capacity == null
      ? null
      : Math.min(100, Math.round((option.taken / option.capacity) * 100));
  const overCap = option.full && option.capacity != null && option.taken > option.capacity;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/phases/${phaseId}/selections?optionId=${option.id}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        setRows([]);
        return;
      }
      const json = (await res.json()) as { selections: AttendeeRow[] };
      setRows(json.selections);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, phaseId, option.id]);

  function toggle() {
    setExpanded((v) => {
      const next = !v;
      if (next && rows === null) void fetchRows();
      return next;
    });
  }

  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/30"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate font-medium">{option.label}</span>
        <div className="hidden sm:flex items-center gap-2 min-w-[120px]">
          {option.capacity == null ? (
            <span className="text-xs text-muted-foreground">no cap</span>
          ) : (
            <>
              <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    overCap ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${capacityPct}%` }}
                />
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  overCap ? "text-destructive font-medium" : "text-muted-foreground"
                }`}
              >
                {option.taken}/{option.capacity}
              </span>
            </>
          )}
        </div>
        <span
          className={`text-sm font-medium tabular-nums whitespace-nowrap ${
            overCap ? "text-destructive" : ""
          }`}
        >
          {option.taken}
        </span>
        {option.receiptRequired && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {option.receiptCount}/{option.taken} receipts
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 px-3 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : rows && rows.length > 0 ? (
            <>
              <div className="space-y-1 text-sm">
                {rows.slice(0, 50).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {row.contact.firstName} {row.contact.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {isSyntheticEmail(row.contact.email) ? "—" : row.contact.email}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {row.source === "ADMIN_ASSIGNED"
                        ? "admin"
                        : "attendee"}
                    </span>
                    {row.hasReceipt && row.receipt ? (
                      <Button asChild variant="ghost" size="sm" className="h-7">
                        <a
                          href={`/api/events/${eventId}/receipts/${row.receipt.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={row.receipt.originalName}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                ))}
                {rows.length > 50 && (
                  <p className="text-xs text-muted-foreground italic pt-1">
                    Showing 50 of {rows.length}. Use CSV export or the
                    attendees-page filter for the full list.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/dashboard/events/${eventId}/attendees?phase=${phaseId}&option=${option.id}`}
                  >
                    View in Attendees →
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/events/${eventId}/phases/${phaseId}/selections?optionId=${option.id}&format=csv`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV for this option
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No attendees have picked this option yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
