"use client";

import {
  Check,
  Clock,
  ExternalLink,
  Info,
  Lock as LockIcon,
} from "lucide-react";
import type { PhaseSelectionMode } from "@prisma/client";
import { Button } from "@/components/ui/button";

// ─── Types — kept local so the page doesn't carry option specifics. ──

export interface PortalPhaseOption {
  id: string;
  label: string;
  labelAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  externalUrl: string | null;
  capacity: number | null;
  metadata: Record<string, string> | null;
  requiresReceipt: boolean | null;
  isActive: boolean;
  order: number;
  taken: number;
  full: boolean;
}

export interface PortalPhaseSelection {
  id: string;
  optionId: string;
  source: "ADMIN_ASSIGNED" | "ATTENDEE_PICKED";
  assignedAt: string;
  updatedAt: string;
  hasReceipt: boolean;
}

interface PhaseOptionsCardProps {
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  allowChangeAfterSubmit: boolean;
  phaseRequiresReceiptUpload: boolean;
  options: PortalPhaseOption[];
  selections: PortalPhaseSelection[];
  selectedOptionIds: string[];
  onChange: (next: string[]) => void;
  isEditing: boolean;
  onStartEditing: () => void;
  /**
   * Page-level read-only flag. True when the phase status is CLOSED /
   * LOCKED — covers the date window or admin-locked override.
   */
  readOnly: boolean;
  rtl?: boolean;
}

/**
 * Mode-dependent options card rendered above the field stepper on the
 * portal phase fill page. Decides between:
 *
 *  • EXTERNAL_BOOKING        → info-only cards with external "Book" links
 *  • ADMIN_ASSIGNED + assigned → single read-only "Your assignment" card
 *  • ADMIN_ASSIGNED + pending  → pending-assignment placeholder
 *  • MIXED + admin pre-assigned → same as the assigned read-only case
 *  • ATTENDEE_PICKS / MIXED + already submitted (and not editing) →
 *    "Your selection" view with optional Change button
 *  • ATTENDEE_PICKS / MIXED + first-time or editing →
 *    interactive picker (single-pick radio metaphor when maxSelections=1,
 *    otherwise checkbox metaphor up to the cap)
 *
 * The card never owns its own draft state — the parent does, so the
 * combined Submit on the page can ship optionIds + field data in one
 * PUT. The card just renders and emits onChange for picker interactions.
 */
export function PhaseOptionsCard({
  selectionMode,
  maxSelections,
  allowChangeAfterSubmit,
  phaseRequiresReceiptUpload,
  options,
  selections,
  selectedOptionIds,
  onChange,
  isEditing,
  onStartEditing,
  readOnly,
  rtl,
}: PhaseOptionsCardProps) {
  if (selectionMode === "NONE") return null;

  const optionById = new Map(options.map((o) => [o.id, o] as const));
  const adminAssigned = selections.find((s) => s.source === "ADMIN_ASSIGNED");
  const hasAttendeeSubmission = selections.some(
    (s) => s.source === "ATTENDEE_PICKED"
  );

  // Read-only / informational modes first.
  if (selectionMode === "EXTERNAL_BOOKING") {
    return (
      <ExternalBookingCard options={options} rtl={rtl} />
    );
  }

  if (selectionMode === "ADMIN_ASSIGNED") {
    if (adminAssigned) {
      const opt = optionById.get(adminAssigned.optionId);
      if (!opt) return null;
      return <AssignedCard option={opt} mixedNote={false} rtl={rtl} />;
    }
    return <PendingAssignmentCard rtl={rtl} />;
  }

  // MIXED mode: pre-assigned attendees see read-only; everyone else picks.
  if (selectionMode === "MIXED" && adminAssigned) {
    const opt = optionById.get(adminAssigned.optionId);
    if (!opt) return null;
    return <AssignedCard option={opt} mixedNote rtl={rtl} />;
  }

  // ATTENDEE_PICKS or MIXED-without-pre-assignment from here down.
  // If the attendee has already submitted and isn't actively editing,
  // show the read-only "Your selection" view with a Change button when
  // allowed.
  if (hasAttendeeSubmission && !isEditing) {
    return (
      <SubmittedSelectionCard
        options={selections
          .filter((s) => s.source === "ATTENDEE_PICKED")
          .map((s) => optionById.get(s.optionId))
          .filter((o): o is PortalPhaseOption => !!o)}
        selections={selections.filter((s) => s.source === "ATTENDEE_PICKED")}
        canChange={allowChangeAfterSubmit && !readOnly}
        onChange={onStartEditing}
        rtl={rtl}
      />
    );
  }

  return (
    <PickerCard
      options={options}
      maxSelections={maxSelections}
      selectedOptionIds={selectedOptionIds}
      onChange={onChange}
      readOnly={readOnly}
      phaseRequiresReceiptUpload={phaseRequiresReceiptUpload}
      rtl={rtl}
    />
  );
}

// ─── Card subcomponents ──────────────────────────────────────────────

function CardShell({
  title,
  children,
  rtl,
}: {
  title: string;
  children: React.ReactNode;
  rtl?: boolean;
}) {
  return (
    <section
      className="rounded-lg border bg-card p-4 sm:p-6"
      dir={rtl ? "rtl" : undefined}
    >
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function PendingAssignmentCard({ rtl }: { rtl?: boolean }) {
  return (
    <CardShell title="Pending assignment" rtl={rtl}>
      <div className="flex items-start gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>Your organizer is finalising arrangements for you.</p>
          <p className="mt-1">
            Check back here, or watch for an email when it&apos;s ready.
          </p>
        </div>
      </div>
    </CardShell>
  );
}

function AssignedCard({
  option,
  mixedNote,
  rtl,
}: {
  option: PortalPhaseOption;
  mixedNote: boolean;
  rtl?: boolean;
}) {
  return (
    <CardShell title="Your assignment" rtl={rtl}>
      <article className="rounded-md border p-4">
        <div className="flex items-start gap-3">
          <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
          <div className="flex-1">
            <h4 className="font-medium">{option.label}</h4>
            {option.labelAr && (
              <p className="text-xs text-muted-foreground" dir="rtl">
                {option.labelAr}
              </p>
            )}
            {option.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {option.description}
              </p>
            )}
            <MetadataList metadata={option.metadata} />
            <p className="mt-3 text-xs text-muted-foreground">
              Assigned by your organizer.
            </p>
          </div>
        </div>
      </article>
      <p className="mt-3 text-xs text-muted-foreground">
        {mixedNote
          ? "This assignment was set by your organizer. Contact them if you need a change."
          : "Selections for this phase are managed by your organizer. Contact them if you need a change."}
      </p>
    </CardShell>
  );
}

function SubmittedSelectionCard({
  options,
  selections,
  canChange,
  onChange,
  rtl,
}: {
  options: PortalPhaseOption[];
  selections: PortalPhaseSelection[];
  canChange: boolean;
  onChange: () => void;
  rtl?: boolean;
}) {
  // Most-recent updatedAt; user-locale formatting via toLocaleString().
  const latestSubmittedAt = (() => {
    if (selections.length === 0) return null;
    return new Date(
      Math.max(...selections.map((s) => new Date(s.updatedAt).getTime()))
    );
  })();

  return (
    <CardShell
      title={canChange ? "Your selection" : "Your selection (locked)"}
      rtl={rtl}
    >
      <div className="space-y-3">
        {options.map((opt) => (
          <article key={opt.id} className="rounded-md border p-4">
            <div className="flex items-start gap-3">
              {canChange ? (
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <LockIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1">
                <h4 className="font-medium">{opt.label}</h4>
                {opt.labelAr && (
                  <p className="text-xs text-muted-foreground" dir="rtl">
                    {opt.labelAr}
                  </p>
                )}
                {opt.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {opt.description}
                  </p>
                )}
                {latestSubmittedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Submitted {latestSubmittedAt.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {canChange
            ? "You can change your selection until the phase closes."
            : "This phase doesn't allow changes once submitted. Contact your organizer if you need a change."}
        </p>
        {canChange && (
          <Button variant="outline" size="sm" onClick={onChange}>
            Change my selection
          </Button>
        )}
      </div>
    </CardShell>
  );
}

function ExternalBookingCard({
  options,
  rtl,
}: {
  options: PortalPhaseOption[];
  rtl?: boolean;
}) {
  return (
    <CardShell title="Booking options" rtl={rtl}>
      <p className="mb-4 text-sm text-muted-foreground">
        Book directly with one of the partners below.
      </p>
      <div className="space-y-3">
        {options
          .filter((o) => o.isActive)
          .map((opt) => (
            <article key={opt.id} className="rounded-md border p-4">
              <h4 className="font-medium">{opt.label}</h4>
              {opt.labelAr && (
                <p className="text-xs text-muted-foreground" dir="rtl">
                  {opt.labelAr}
                </p>
              )}
              {opt.description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {opt.description}
                </p>
              )}
              <MetadataList metadata={opt.metadata} />
              {opt.externalUrl && (
                <div className="mt-3">
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={opt.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Book {opt.label}
                    </a>
                  </Button>
                </div>
              )}
            </article>
          ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Receipt upload arrives in the next release. For now, please book
          externally — we&apos;ll wire up the upload flow soon.
        </p>
      </div>
    </CardShell>
  );
}

function PickerCard({
  options,
  maxSelections,
  selectedOptionIds,
  onChange,
  readOnly,
  phaseRequiresReceiptUpload,
  rtl,
}: {
  options: PortalPhaseOption[];
  maxSelections: number;
  selectedOptionIds: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
  phaseRequiresReceiptUpload: boolean;
  rtl?: boolean;
}) {
  const isMulti = maxSelections > 1;
  const activeOptions = options.filter((o) => o.isActive);
  const selectedSet = new Set(selectedOptionIds);
  const remaining = Math.max(0, maxSelections - selectedSet.size);

  function toggle(optionId: string) {
    if (readOnly) return;
    const opt = activeOptions.find((o) => o.id === optionId);
    if (!opt) return;
    // Treat full as disabled — except if the user already has it selected
    // (e.g. they were assigned and the option is now full for new picks
    // but we still let them keep their existing pick).
    if (opt.full && !selectedSet.has(optionId)) return;

    if (isMulti) {
      if (selectedSet.has(optionId)) {
        onChange(selectedOptionIds.filter((id) => id !== optionId));
      } else if (selectedSet.size < maxSelections) {
        onChange([...selectedOptionIds, optionId]);
      }
    } else {
      // Single-pick: clicking the already-selected card deselects.
      if (selectedSet.has(optionId)) onChange([]);
      else onChange([optionId]);
    }
  }

  const headerText = (() => {
    if (isMulti) {
      return `Choose up to ${maxSelections} — ${selectedSet.size} of ${maxSelections} selected`;
    }
    return "Choose one";
  })();

  return (
    <CardShell title={headerText} rtl={rtl}>
      <div
        className={
          isMulti
            ? "grid gap-3 sm:grid-cols-2"
            : "space-y-3"
        }
      >
        {activeOptions.map((opt) => {
          const isSelected = selectedSet.has(opt.id);
          const isFullDisabled = opt.full && !isSelected;
          const capLeft =
            opt.capacity == null ? null : Math.max(0, opt.capacity - opt.taken);
          const willCapBlock =
            isMulti && !isSelected && remaining === 0;
          const interactable = !readOnly && !isFullDisabled && !willCapBlock;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={!interactable}
              onClick={() => toggle(opt.id)}
              aria-pressed={isSelected}
              className={[
                "w-full rounded-md border p-4 text-left transition",
                isSelected
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-foreground/20",
                !interactable
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                {/* Indicator: radio for single-pick, checkbox for multi-pick. */}
                <span
                  aria-hidden
                  className={[
                    "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border",
                    isMulti ? "rounded" : "rounded-full",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-foreground/30",
                  ].join(" ")}
                >
                  {isSelected ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : null}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium truncate">{opt.label}</h4>
                    {/* Capacity badge — friendly wording, not the admin */}
                    {/* compact form. */}
                    <CapacityBadge
                      capacity={opt.capacity}
                      remaining={capLeft}
                      full={opt.full}
                    />
                  </div>
                  {opt.labelAr && (
                    <p className="text-xs text-muted-foreground" dir="rtl">
                      {opt.labelAr}
                    </p>
                  )}
                  {opt.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {opt.description}
                    </p>
                  )}
                  <MetadataList metadata={opt.metadata} />
                  {/* Stage-3 receipt-required hint. Stage 4 wires the */}
                  {/* upload flow itself. */}
                  {(opt.requiresReceipt === true ||
                    (opt.requiresReceipt === null &&
                      phaseRequiresReceiptUpload)) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Receipt upload required after submitting (coming next
                      release).
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {isMulti && remaining > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {remaining === 1
            ? "1 more pick available."
            : `${remaining} more picks available.`}
        </p>
      )}
    </CardShell>
  );
}

function CapacityBadge({
  capacity,
  remaining,
  full,
}: {
  capacity: number | null;
  remaining: number | null;
  full: boolean;
}) {
  if (capacity == null || remaining == null) return null;
  if (full) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Full
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">
      {remaining} of {capacity} left
    </span>
  );
}

function MetadataList({
  metadata,
}: {
  metadata: Record<string, string> | null;
}) {
  if (!metadata) return null;
  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium capitalize">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
