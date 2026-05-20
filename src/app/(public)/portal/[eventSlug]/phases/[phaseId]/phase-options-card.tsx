"use client";

import { useState } from "react";
import {
  Check,
  Clock,
  ExternalLink,
  Lock as LockIcon,
} from "lucide-react";
import type { PhaseSelectionMode } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { pickText, type PortalLang } from "@/lib/portal/i18n";
import {
  ReceiptUploadControl,
  type PortalReceipt,
} from "./receipt-upload-control";

// PortalLang is re-exported here for the existing import sites that
// took it from this module before it was lifted to @/lib/portal/i18n.
// New code should import from there directly.
export type { PortalLang };

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
  // Category-Phases stage 3 — per-option receipt copy. Rendered above
  // the file picker on the ReceiptUploadControl when present. When all
  // four are null (or all four in the active language are null) the
  // control renders unchanged.
  receiptLabel: string | null;
  receiptInstructions: string | null;
  receiptLabelAr: string | null;
  receiptInstructionsAr: string | null;
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
  // Stage 4: receipt metadata (no blobUrl/blobPath, those are server-only).
  // Null when the selection has no linked receipt yet.
  receipt: PortalReceipt | null;
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
  // ── Stage 4: receipt-upload plumbing. The card never owns the
  // ── phase fetch; the parent does. After an upload or delete the
  // ── parent re-fetches and re-renders the card with updated
  // ── PortalPhaseSelection.receipt values.
  eventSlug: string;
  phaseId: string;
  onReceiptChange: () => Promise<void> | void;
  /**
   * Active language for the portal. When "ar" the card flips to RTL,
   * picks Arabic primary text where available (falling back to English
   * when an option author left a labelAr blank), and renders all
   * static UI strings in Arabic. The page is responsible for setting
   * this — it should match the rest of the page's language choice.
   */
  lang: PortalLang;
}

// ─── Static UI strings, kept in one place. ──────────────────────────

const STRINGS = {
  en: {
    yourAssignment: "Your assignment",
    yourSelection: "Your selection",
    yourSelectionLocked: "Your selection (locked)",
    chooseOne: "Choose one",
    pendingAssignment: "Pending assignment",
    pendingAssignmentBody1: "Your organizer is finalising arrangements for you.",
    pendingAssignmentBody2:
      "Check back here, or watch for an email when it's ready.",
    assignedByYourOrganizer: "Assigned by your organizer.",
    managedNote:
      "Selections for this phase are managed by your organizer. Contact them if you need a change.",
    mixedNote:
      "This assignment was set by your organizer. Contact them if you need a change.",
    bookingOptions: "Booking options",
    bookingIntro: "Book directly with one of the partners below.",
    bookCta: "Book",
    externalBookingUploadIntro:
      "Once you've booked, upload your receipt to confirm.",
    externalBookingWhichOption: "Which option did you book?",
    externalBookingPickPlaceholder: "Select a booking…",
    externalBookingPickFirst:
      "Pick an option above to upload a receipt.",
    full: "Full",
    leftOf: (left: number, total: number) => `${left} of ${total} left`,
    chooseUpTo: (max: number, picked: number) =>
      `Choose up to ${max} — ${picked} of ${max} selected`,
    receiptRequiredHint: "Receipt required after submitting.",
    morePicks: (n: number) =>
      n === 1 ? "1 more pick available." : `${n} more picks available.`,
    submittedAt: (s: string) => `Submitted ${s}`,
    canChange: "You can change your selection until the phase closes.",
    locked:
      "This phase doesn't allow changes once submitted. Contact your organizer if you need a change.",
    changeBtn: "Change my selection",
  },
  ar: {
    yourAssignment: "اختيارك",
    yourSelection: "اختيارك",
    yourSelectionLocked: "اختيارك (مقفل)",
    chooseOne: "اختر واحدًا",
    pendingAssignment: "بانتظار التخصيص",
    pendingAssignmentBody1:
      "يقوم منظم الفعالية بإتمام الترتيبات الخاصة بك.",
    pendingAssignmentBody2:
      "تابع هذه الصفحة أو انتظر إشعارًا بالبريد الإلكتروني عند جهوزيتها.",
    assignedByYourOrganizer: "مخصّص من قِبل منظم الفعالية.",
    managedNote:
      "هذه الاختيارات يديرها منظم الفعالية. تواصل معه إذا احتجت إلى تغيير.",
    mixedNote:
      "تم تخصيص هذا الاختيار من قِبل منظم الفعالية. تواصل معه إذا احتجت إلى تغيير.",
    bookingOptions: "خيارات الحجز",
    bookingIntro: "احجز مباشرة مع أحد الشركاء أدناه.",
    bookCta: "احجز",
    externalBookingUploadIntro:
      "بمجرد الحجز، ارفع الإيصال للتأكيد.",
    externalBookingWhichOption: "ما الخيار الذي حجزته؟",
    externalBookingPickPlaceholder: "اختر حجزًا…",
    externalBookingPickFirst:
      "اختر خيارًا من الأعلى لرفع الإيصال.",
    full: "مكتمل",
    leftOf: (left: number, total: number) =>
      `متبقي ${left} من ${total}`,
    chooseUpTo: (max: number, picked: number) =>
      `اختر حتى ${max} — تم اختيار ${picked} من ${max}`,
    receiptRequiredHint: "يلزم رفع الإيصال بعد الإرسال.",
    morePicks: (n: number) =>
      n === 1
        ? "يمكنك اختيار خيار إضافي واحد."
        : `يمكنك اختيار ${n} خيارات إضافية.`,
    submittedAt: (s: string) => `أُرسل في ${s}`,
    canChange: "يمكنك تغيير اختيارك حتى إغلاق المرحلة.",
    locked:
      "لا تسمح هذه المرحلة بالتعديل بعد الإرسال. تواصل مع منظم الفعالية إذا احتجت إلى تغيير.",
    changeBtn: "تغيير الاختيار",
  },
} as const;

// `pickText` is shared via @/lib/portal/i18n; no local definition.
// Wrapper kept for the existing call-sites returning string | null —
// the shared helper returns string (empty for missing English), so
// callers that want null-on-empty wrap here.
function pick(
  lang: PortalLang,
  en: string | null | undefined,
  ar: string | null | undefined
): string | null {
  const v = pickText(lang, en, ar);
  return v === "" ? null : v;
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
  lang,
  eventSlug,
  phaseId,
  onReceiptChange,
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
      <ExternalBookingCard
        options={options}
        selections={selections}
        eventSlug={eventSlug}
        phaseId={phaseId}
        allowChangeAfterSubmit={allowChangeAfterSubmit && !readOnly}
        lang={lang}
        onReceiptChange={onReceiptChange}
      />
    );
  }

  if (selectionMode === "ADMIN_ASSIGNED") {
    if (adminAssigned) {
      const opt = optionById.get(adminAssigned.optionId);
      if (!opt) return null;
      return <AssignedCard option={opt} mixedNote={false} lang={lang} />;
    }
    return <PendingAssignmentCard lang={lang} />;
  }

  // MIXED mode: pre-assigned attendees see read-only; everyone else picks.
  if (selectionMode === "MIXED" && adminAssigned) {
    const opt = optionById.get(adminAssigned.optionId);
    if (!opt) return null;
    return <AssignedCard option={opt} mixedNote lang={lang} />;
  }

  // ATTENDEE_PICKS or MIXED-without-pre-assignment from here down.
  // If the attendee has already submitted and isn't actively editing,
  // show the read-only "Your selection" view with a Change button when
  // allowed.
  if (hasAttendeeSubmission && !isEditing) {
    return (
      <SubmittedSelectionCard
        attendeeSelections={selections.filter(
          (s) => s.source === "ATTENDEE_PICKED"
        )}
        optionById={optionById}
        canChange={allowChangeAfterSubmit && !readOnly}
        onChange={onStartEditing}
        lang={lang}
        eventSlug={eventSlug}
        phaseId={phaseId}
        phaseRequiresReceiptUpload={phaseRequiresReceiptUpload}
        onReceiptChange={onReceiptChange}
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
      lang={lang}
    />
  );
}

// ─── Card subcomponents ──────────────────────────────────────────────

function CardShell({
  title,
  children,
  lang,
}: {
  title: string;
  children: React.ReactNode;
  lang: PortalLang;
}) {
  return (
    <section
      className="rounded-lg border bg-card p-4 sm:p-6"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function PendingAssignmentCard({ lang }: { lang: PortalLang }) {
  const t = STRINGS[lang];
  return (
    <CardShell title={t.pendingAssignment} lang={lang}>
      <div className="flex items-start gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>{t.pendingAssignmentBody1}</p>
          <p className="mt-1">{t.pendingAssignmentBody2}</p>
        </div>
      </div>
    </CardShell>
  );
}

function AssignedCard({
  option,
  mixedNote,
  lang,
}: {
  option: PortalPhaseOption;
  mixedNote: boolean;
  lang: PortalLang;
}) {
  const t = STRINGS[lang];
  const label = pick(lang, option.label, option.labelAr);
  const description = pick(lang, option.description, option.descriptionAr);
  // Secondary line: show the OTHER language's label as a small subtitle
  // so attendees who skim past the headline can still recognise the
  // option by its more familiar name. Only renders if both variants
  // exist and they differ.
  const secondary =
    lang === "ar"
      ? option.label && option.labelAr && option.label !== option.labelAr
        ? option.label
        : null
      : option.labelAr && option.label && option.labelAr !== option.label
      ? option.labelAr
      : null;
  return (
    <CardShell title={t.yourAssignment} lang={lang}>
      <article className="rounded-md border p-4">
        <div className="flex items-start gap-3">
          <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
          <div className="flex-1">
            <h4 className="font-medium">{label}</h4>
            {secondary && (
              <p
                className="text-xs text-muted-foreground"
                dir={lang === "ar" ? "ltr" : "rtl"}
              >
                {secondary}
              </p>
            )}
            {description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {description}
              </p>
            )}
            <MetadataList metadata={option.metadata} />
            <p className="mt-3 text-xs text-muted-foreground">
              {t.assignedByYourOrganizer}
            </p>
          </div>
        </div>
      </article>
      <p className="mt-3 text-xs text-muted-foreground">
        {mixedNote ? t.mixedNote : t.managedNote}
      </p>
    </CardShell>
  );
}

function SubmittedSelectionCard({
  attendeeSelections,
  optionById,
  canChange,
  onChange,
  lang,
  eventSlug,
  phaseId,
  phaseRequiresReceiptUpload,
  onReceiptChange,
}: {
  attendeeSelections: PortalPhaseSelection[];
  optionById: Map<string, PortalPhaseOption>;
  canChange: boolean;
  onChange: () => void;
  lang: PortalLang;
  eventSlug: string;
  phaseId: string;
  phaseRequiresReceiptUpload: boolean;
  onReceiptChange: () => Promise<void> | void;
}) {
  const t = STRINGS[lang];
  // Most-recent updatedAt — formatted with the active locale so Arabic
  // users see Arabic numerals + Arabic month names.
  const latestSubmittedAt = (() => {
    if (attendeeSelections.length === 0) return null;
    return new Date(
      Math.max(
        ...attendeeSelections.map((s) => new Date(s.updatedAt).getTime())
      )
    );
  })();
  const localeTag = lang === "ar" ? "ar-SA" : undefined;

  return (
    <CardShell
      title={canChange ? t.yourSelection : t.yourSelectionLocked}
      lang={lang}
    >
      <div className="space-y-3">
        {attendeeSelections.map((sel) => {
          const opt = optionById.get(sel.optionId);
          if (!opt) return null;
          const label = pick(lang, opt.label, opt.labelAr);
          const description = pick(lang, opt.description, opt.descriptionAr);
          const secondary =
            lang === "ar"
              ? opt.label && opt.labelAr && opt.label !== opt.labelAr
                ? opt.label
                : null
              : opt.labelAr && opt.label && opt.labelAr !== opt.label
              ? opt.labelAr
              : null;
          // Receipt requirement for this option (per-option override
          // wins; falls back to phase-level default when null).
          const effectiveRequiresReceipt =
            opt.requiresReceipt === null
              ? phaseRequiresReceiptUpload
              : opt.requiresReceipt;
          return (
            <article key={sel.id} className="rounded-md border p-4">
              <div className="flex items-start gap-3">
                {canChange ? (
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <LockIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <h4 className="font-medium">{label}</h4>
                  {secondary && (
                    <p
                      className="text-xs text-muted-foreground"
                      dir={lang === "ar" ? "ltr" : "rtl"}
                    >
                      {secondary}
                    </p>
                  )}
                  {description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {description}
                    </p>
                  )}
                  {latestSubmittedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.submittedAt(
                        latestSubmittedAt.toLocaleString(localeTag)
                      )}
                    </p>
                  )}
                  {/* Stage 4: per-selection receipt control. Shown */}
                  {/* whenever the option needs a receipt OR already */}
                  {/* has one (so the user can view it). */}
                  {(effectiveRequiresReceipt || sel.receipt) && (
                    <div className="mt-4 border-t pt-4">
                      <ReceiptUploadControl
                        eventSlug={eventSlug}
                        phaseId={phaseId}
                        optionId={opt.id}
                        existingReceipt={sel.receipt}
                        allowReplace={canChange}
                        required={!!effectiveRequiresReceipt}
                        lang={lang}
                        receiptLabel={opt.receiptLabel}
                        receiptInstructions={opt.receiptInstructions}
                        receiptLabelAr={opt.receiptLabelAr}
                        receiptInstructionsAr={opt.receiptInstructionsAr}
                        onUploaded={onReceiptChange}
                        onDeleted={onReceiptChange}
                      />
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {canChange ? t.canChange : t.locked}
        </p>
        {canChange && (
          <Button variant="outline" size="sm" onClick={onChange}>
            {t.changeBtn}
          </Button>
        )}
      </div>
    </CardShell>
  );
}

function ExternalBookingCard({
  options,
  selections,
  eventSlug,
  phaseId,
  allowChangeAfterSubmit,
  lang,
  onReceiptChange,
}: {
  options: PortalPhaseOption[];
  selections: PortalPhaseSelection[];
  eventSlug: string;
  phaseId: string;
  allowChangeAfterSubmit: boolean;
  lang: PortalLang;
  onReceiptChange: () => Promise<void> | void;
}) {
  const t = STRINGS[lang];
  const activeOptions = options.filter((o) => o.isActive);
  const optById = new Map(options.map((o) => [o.id, o] as const));

  // EXTERNAL_BOOKING is single-pick by design — show the first
  // attendee-picked selection if one exists. The picked-by-receipt
  // model means a selection only exists once a receipt has been
  // uploaded (the receipt creates the selection).
  const attendeeSelection =
    selections.find((s) => s.source === "ATTENDEE_PICKED") ?? null;
  const pickedOption = attendeeSelection
    ? optById.get(attendeeSelection.optionId) ?? null
    : null;

  // Selection state for the "upload to confirm" dropdown. Only used
  // before the attendee has uploaded anything.
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);

  // ── Already-uploaded path: show the chosen option + receipt + (optionally) replace.
  if (attendeeSelection && pickedOption) {
    const label = pick(lang, pickedOption.label, pickedOption.labelAr);
    const description = pick(
      lang,
      pickedOption.description,
      pickedOption.descriptionAr
    );
    return (
      <CardShell
        title={
          allowChangeAfterSubmit ? t.yourSelection : t.yourSelectionLocked
        }
        lang={lang}
      >
        <article className="rounded-md border p-4">
          <div className="flex items-start gap-3">
            {allowChangeAfterSubmit ? (
              <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <LockIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1">
              <h4 className="font-medium">{label}</h4>
              {description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
              {pickedOption.externalUrl && (
                <div className="mt-3">
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={pickedOption.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t.bookCta} {label}
                    </a>
                  </Button>
                </div>
              )}
              <div className="mt-4 border-t pt-4">
                {/* In EXTERNAL_BOOKING the receipt always confirms the */}
                {/* selection — required:true is implicit per spec. */}
                <ReceiptUploadControl
                  eventSlug={eventSlug}
                  phaseId={phaseId}
                  optionId={pickedOption.id}
                  existingReceipt={attendeeSelection.receipt}
                  allowReplace={allowChangeAfterSubmit}
                  required
                  lang={lang}
                  receiptLabel={pickedOption.receiptLabel}
                  receiptInstructions={pickedOption.receiptInstructions}
                  receiptLabelAr={pickedOption.receiptLabelAr}
                  receiptInstructionsAr={pickedOption.receiptInstructionsAr}
                  onUploaded={onReceiptChange}
                  onDeleted={onReceiptChange}
                />
              </div>
            </div>
          </div>
        </article>
        <p className="mt-3 text-xs text-muted-foreground">
          {allowChangeAfterSubmit ? t.canChange : t.locked}
        </p>
      </CardShell>
    );
  }

  // ── Pre-upload path: show booking links + dropdown + upload control.
  return (
    <CardShell title={t.bookingOptions} lang={lang}>
      <p className="mb-4 text-sm text-muted-foreground">{t.bookingIntro}</p>
      <div className="space-y-3">
        {activeOptions.map((opt) => {
          const label = pick(lang, opt.label, opt.labelAr);
          const description = pick(
            lang,
            opt.description,
            opt.descriptionAr
          );
          const secondary =
            lang === "ar"
              ? opt.label && opt.labelAr && opt.label !== opt.labelAr
                ? opt.label
                : null
              : opt.labelAr && opt.label && opt.labelAr !== opt.label
              ? opt.labelAr
              : null;
          return (
            <article key={opt.id} className="rounded-md border p-4">
              <h4 className="font-medium">{label}</h4>
              {secondary && (
                <p
                  className="text-xs text-muted-foreground"
                  dir={lang === "ar" ? "ltr" : "rtl"}
                >
                  {secondary}
                </p>
              )}
              {description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {description}
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
                      {t.bookCta} {label}
                    </a>
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Confirm-by-upload section. Visible whenever there's no existing */}
      {/* selection yet — the upload creates the selection atomically. */}
      <div className="mt-6 border-t pt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {t.externalBookingUploadIntro}
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t.externalBookingWhichOption}
          </label>
          <Select
            value={pendingOptionId ?? ""}
            onValueChange={(v) => setPendingOptionId(v || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t.externalBookingPickPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {activeOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {pick(lang, opt.label, opt.labelAr)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pendingOptionId ? (
          // Dropdown chose an option → show the upload control bound
          // to that option. The control's success path creates the
          // selection AND links the receipt in one server transaction
          // (see writeReceiptIdempotent). Look up the option so we can
          // pass its receipt copy through.
          (() => {
            const pendingOpt = optById.get(pendingOptionId);
            return (
              <ReceiptUploadControl
                eventSlug={eventSlug}
                phaseId={phaseId}
                optionId={pendingOptionId}
                existingReceipt={null}
                allowReplace={false}
                required
                lang={lang}
                receiptLabel={pendingOpt?.receiptLabel ?? null}
                receiptInstructions={pendingOpt?.receiptInstructions ?? null}
                receiptLabelAr={pendingOpt?.receiptLabelAr ?? null}
                receiptInstructionsAr={
                  pendingOpt?.receiptInstructionsAr ?? null
                }
                onUploaded={onReceiptChange}
                onDeleted={onReceiptChange}
              />
            );
          })()
        ) : (
          // No option picked yet — show the disabled CTA placeholder
          // so the layout doesn't jump when the user picks one.
          <p className="text-xs text-muted-foreground">
            {t.externalBookingPickFirst}
          </p>
        )}
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
  lang,
}: {
  options: PortalPhaseOption[];
  maxSelections: number;
  selectedOptionIds: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
  phaseRequiresReceiptUpload: boolean;
  lang: PortalLang;
}) {
  const t = STRINGS[lang];
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

  const headerText = isMulti
    ? t.chooseUpTo(maxSelections, selectedSet.size)
    : t.chooseOne;

  return (
    <CardShell title={headerText} lang={lang}>
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
          const label = pick(lang, opt.label, opt.labelAr);
          const description = pick(lang, opt.description, opt.descriptionAr);
          const secondary =
            lang === "ar"
              ? opt.label && opt.labelAr && opt.label !== opt.labelAr
                ? opt.label
                : null
              : opt.labelAr && opt.label && opt.labelAr !== opt.label
              ? opt.labelAr
              : null;

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
                    <h4 className="font-medium truncate">{label}</h4>
                    {/* Capacity badge — friendly wording, not the admin */}
                    {/* compact form. */}
                    <CapacityBadge
                      capacity={opt.capacity}
                      remaining={capLeft}
                      full={opt.full}
                      lang={lang}
                    />
                  </div>
                  {secondary && (
                    <p
                      className="text-xs text-muted-foreground"
                      dir={lang === "ar" ? "ltr" : "rtl"}
                    >
                      {secondary}
                    </p>
                  )}
                  {description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {description}
                    </p>
                  )}
                  <MetadataList metadata={opt.metadata} />
                  {/* Stage-3 receipt-required hint. Stage 4 wires the */}
                  {/* upload flow itself. */}
                  {(opt.requiresReceipt === true ||
                    (opt.requiresReceipt === null &&
                      phaseRequiresReceiptUpload)) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.receiptRequiredHint}
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
          {t.morePicks(remaining)}
        </p>
      )}
    </CardShell>
  );
}

function CapacityBadge({
  capacity,
  remaining,
  full,
  lang,
}: {
  capacity: number | null;
  remaining: number | null;
  full: boolean;
  lang: PortalLang;
}) {
  const t = STRINGS[lang];
  if (capacity == null || remaining == null) return null;
  if (full) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {t.full}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">
      {t.leftOf(remaining, capacity)}
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
