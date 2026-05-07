"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Loader2,
  Lock as LockIcon,
} from "lucide-react";
import { COUNTRIES } from "@/lib/form-builder/countries";
import { isFieldVisible } from "@/lib/form-conditional";
import type { PhaseSelectionMode } from "@prisma/client";
import {
  PhaseOptionsCard,
  type PortalPhaseOption,
  type PortalPhaseSelection,
} from "./phase-options-card";

interface FormField {
  id: string;
  name: string;
  label: string;
  labelAr?: string;
  type: string;
  placeholder?: string;
  placeholderAr?: string;
  helpText?: string;
  helpTextAr?: string;
  required: boolean;
  validation?: Record<string, unknown>;
  options?: { value: string; label: string; labelAr?: string }[];
  order: number;
  width: string;
  conditional?: Record<string, unknown>;
  isSystem: boolean;
  defaultValue?: string;
}

interface FormStep {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  order: number;
  fields: FormField[];
}

type PhaseStatus = "LOCKED" | "NOT_OPEN" | "OPEN" | "CLOSED";

interface Branding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  customCss?: string | null;
}

interface EventLite {
  name: string;
  slug: string;
  branding?: Branding | null;
}

interface PhaseData {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  isRequired: boolean;
  status: PhaseStatus;
  steps: FormStep[];
  // Stage 3: selection-related fields. Always present on the wire even
  // when the phase has no options panel — defaults to NONE/1/false/false
  // server-side, so legacy phases keep working unchanged.
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  options: PortalPhaseOption[];
}

interface SubmissionData {
  data: Record<string, unknown>;
  submittedAt: string;
  updatedAt: string;
}

type FormValueMap = Record<string, string | boolean | string[]>;

export default function PortalPhaseFillPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventSlug = params.eventSlug as string;
  const phaseId = params.phaseId as string;

  const [pageLoading, setPageLoading] = useState(true);
  const [phase, setPhase] = useState<PhaseData | null>(null);
  const [event, setEvent] = useState<EventLite | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formValues, setFormValues] = useState<FormValueMap>({});
  const [currentStep, setCurrentStep] = useState(0);

  // Stage 3 selection state.
  const [selections, setSelections] = useState<PortalPhaseSelection[]>([]);
  const [selectionsUpdatedAt, setSelectionsUpdatedAt] = useState<string | null>(
    null
  );
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  // True when the picker is actively shown. Defaults to true when there
  // are no prior attendee selections; flips to false after a successful
  // submit, and back to true if the user clicks "Change my selection".
  const [isEditingSelections, setIsEditingSelections] = useState(true);

  // Anchor to scroll the page back to the options card when a capacity
  // race forces a re-pick.
  const optionsCardRef = useRef<HTMLDivElement | null>(null);

  const totalSteps = phase?.steps.length ?? 0;
  const isMultiStep = totalSteps > 1;
  const activeStep = phase?.steps[currentStep] ?? null;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const readOnly = phase?.status === "CLOSED" || phase?.status === "LOCKED";

  useEffect(() => {
    async function fetchPhase() {
      try {
        const url = `/api/portal/${eventSlug}/phases/${phaseId}`;
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.status === 401) {
          // No valid session — bounce to portal so the user can log in.
          router.replace(`/portal/${eventSlug}`);
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load phase");
          setPageLoading(false);
          return;
        }
        const p: PhaseData = data.phase;
        const sub: SubmissionData | null = data.submission;
        const sels: PortalPhaseSelection[] = data.selections ?? [];
        const selUpdatedAt: string | null = data.selectionsUpdatedAt ?? null;
        setPhase(p);
        setEvent(data.event ?? null);
        setSubmission(sub);
        setSelections(sels);
        setSelectionsUpdatedAt(selUpdatedAt);

        // Seed selectedOptionIds from existing attendee selections so the
        // picker re-opens pre-filled when the user clicks "Change my
        // selection". Admin-assigned rows aren't editable from here, so
        // they don't seed the picker draft.
        const attendeeSelectedIds = sels
          .filter((s) => s.source === "ATTENDEE_PICKED")
          .map((s) => s.optionId);
        setSelectedOptionIds(attendeeSelectedIds);
        // Picker is shown by default for first-time attendees; the
        // "submitted" view appears once they have any attendee-picked
        // selections and they're not actively editing.
        setIsEditingSelections(attendeeSelectedIds.length === 0);

        // Seed form values: existing submission > field default > empty.
        const allFields = p.steps.flatMap((s) => s.fields);
        const seeded: FormValueMap = {};
        for (const f of allFields) {
          const fromSub = sub?.data?.[f.name];
          if (fromSub !== undefined && fromSub !== null) {
            seeded[f.name] = fromSub as FormValueMap[string];
          } else if (f.defaultValue) {
            seeded[f.name] = f.defaultValue;
          } else if (f.type === "CHECKBOX") {
            seeded[f.name] = false;
          } else if (f.type === "MULTISELECT") {
            seeded[f.name] = [];
          } else {
            seeded[f.name] = "";
          }
        }
        setFormValues(seeded);
      } catch {
        setError("Failed to load phase");
      } finally {
        setPageLoading(false);
      }
    }
    fetchPhase();
  }, [eventSlug, phaseId, router]);

  const visibleFields = useMemo(() => {
    if (!activeStep) return [];
    return activeStep.fields.filter((f) =>
      isFieldVisible(f.conditional, formValues)
    );
  }, [activeStep, formValues]);

  // ── ?step=N URL sync ────────────────────────────────────────────────
  useEffect(() => {
    if (pageLoading || totalSteps === 0) return;
    const sp = new URLSearchParams(searchParams.toString());
    if (isMultiStep) {
      sp.set("step", String(currentStep + 1));
    } else {
      sp.delete("step");
    }
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : `?`, { scroll: false });
  }, [currentStep, pageLoading, totalSteps, isMultiStep, router, searchParams]);

  // Initial step from ?step=
  const initStepRef = useRef(false);
  useEffect(() => {
    if (initStepRef.current) return;
    if (totalSteps === 0) return;
    initStepRef.current = true;
    const stepParam = searchParams.get("step");
    if (stepParam !== null) {
      const n = Math.max(0, Math.min(totalSteps - 1, parseInt(stepParam, 10) - 1));
      if (!Number.isNaN(n)) setCurrentStep(n);
    }
  }, [totalSteps, searchParams]);

  function handleFieldChange(name: string, value: string | boolean | string[]) {
    if (readOnly) return;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setError("");
  }

  function validateCurrentStep(): boolean {
    if (!activeStep) return false;
    for (const field of activeStep.fields) {
      if (!field.required) continue;
      if (!isFieldVisible(field.conditional, formValues)) continue;
      const value = formValues[field.name];
      const empty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        setError("Please complete the required fields before continuing.");
        return false;
      }
    }
    setError("");
    return true;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    if (isLastStep) return;
    setCurrentStep((s) => s + 1);
  }
  function goBack() {
    if (isFirstStep) return;
    setError("");
    setCurrentStep((s) => s - 1);
  }

  async function performSubmit() {
    if (readOnly) return;
    if (!isLastStep) {
      goNext();
      return;
    }
    if (!validateCurrentStep()) return;
    setSubmitting(true);
    setError("");

    // Build the request body. We send optionIds whenever the phase has a
    // writable selection mode AND the picker is actively editable —
    // otherwise we skip the field entirely so the server doesn't run the
    // selection write path. The expectedSelectionsUpdatedAt token comes
    // from the most recent GET / submit response.
    const isWritableMode =
      phase?.selectionMode === "ATTENDEE_PICKS" ||
      phase?.selectionMode === "MIXED";
    const adminPreAssigned = selections.some(
      (s) => s.source === "ADMIN_ASSIGNED"
    );
    const includeOptions =
      isWritableMode && !adminPreAssigned && isEditingSelections;

    const body: {
      data: FormValueMap;
      optionIds?: string[];
      expectedSelectionsUpdatedAt?: string | null;
    } = { data: formValues };
    if (includeOptions) {
      body.optionIds = selectedOptionIds;
      body.expectedSelectionsUpdatedAt = selectionsUpdatedAt;
    }

    try {
      const res = await fetch(`/api/portal/${eventSlug}/phases/${phaseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace(`/portal/${eventSlug}`);
        return;
      }
      const result = await res.json();

      if (res.ok) {
        // Reconcile local state from the server response so the next
        // edit cycle uses the fresh updatedAt token.
        if (result.selections) {
          setSelections(result.selections);
        }
        if (result.selectionsUpdatedAt !== undefined) {
          setSelectionsUpdatedAt(result.selectionsUpdatedAt);
        }
        if (result.options && phase) {
          // Merge refreshed counts into the page's options without
          // dropping any other local state.
          setPhase({
            ...phase,
            options: phase.options.map((o) => {
              const fresh = (
                result.options as Array<{
                  id: string;
                  capacity: number | null;
                  taken: number;
                  full: boolean;
                }>
              ).find((r) => r.id === o.id);
              if (!fresh) return o;
              return { ...o, taken: fresh.taken, full: fresh.full };
            }),
          });
        }
        // Successful submit closes the picker. The user lands on the
        // submitted-view card; they can re-open via "Change my selection".
        setIsEditingSelections(false);
        setSuccess(true);
        return;
      }

      // ── Non-OK response handling ────────────────────────────────────
      // 409 OPTION_FULL: refresh capacity counts in-place, deselect the
      // dead option, scroll to options card. The user fixes the pick and
      // re-clicks Submit.
      if (res.status === 409 && result.code === "OPTION_FULL") {
        const failingOptionId: string | undefined = result.optionId;
        if (Array.isArray(result.options) && phase) {
          setPhase({
            ...phase,
            options: phase.options.map((o) => {
              const fresh = (
                result.options as Array<{
                  id: string;
                  capacity: number | null;
                  taken: number;
                  full: boolean;
                }>
              ).find((r) => r.id === o.id);
              if (!fresh) return o;
              return { ...o, taken: fresh.taken, full: fresh.full };
            }),
          });
        }
        if (failingOptionId) {
          setSelectedOptionIds((ids) =>
            ids.filter((id) => id !== failingOptionId)
          );
        }
        setError(
          result.error ||
            "An option you picked just filled up. Please pick another and resubmit."
        );
        // Scroll to options so the user sees the badge update.
        optionsCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      // 409 SELECTIONS_CONCURRENCY: another tab / device already saved
      // a newer version. Refetch the phase so the user sees the fresh
      // state, then re-applies their edit.
      if (res.status === 409 && result.code === "SELECTIONS_CONCURRENCY") {
        setError(
          "Your selection was updated elsewhere. Reloading the latest…"
        );
        // Trigger a page-data refresh.
        router.refresh();
        // Re-fetch the phase state directly so local state catches up
        // without waiting for navigation.
        try {
          const r = await fetch(
            `/api/portal/${eventSlug}/phases/${phaseId}`,
            { credentials: "same-origin" }
          );
          if (r.ok) {
            const fresh = await r.json();
            setPhase(fresh.phase);
            setSubmission(fresh.submission);
            setSelections(fresh.selections ?? []);
            setSelectionsUpdatedAt(fresh.selectionsUpdatedAt ?? null);
            const attendeeIds = (fresh.selections ?? [])
              .filter(
                (s: PortalPhaseSelection) => s.source === "ATTENDEE_PICKED"
              )
              .map((s: PortalPhaseSelection) => s.optionId);
            setSelectedOptionIds(attendeeIds);
            setIsEditingSelections(true);
          }
        } catch {
          // Refetch failed; user can manually reload.
        }
        return;
      }

      // 409 SELECTIONS_LOCKED / 403 SELECTIONS_ADMIN_LOCKED: the phase
      // doesn't allow attendee changes. Surface the friendly message.
      if (
        result.code === "SELECTIONS_LOCKED" ||
        result.code === "SELECTIONS_ADMIN_LOCKED"
      ) {
        setError(result.error || "This phase doesn't allow changes.");
        setIsEditingSelections(false);
        return;
      }

      // Generic non-OK: surface the server's message.
      setError(result.error || "Submission failed");
    } catch {
      setError("Submission failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Defensive: nothing should submit through here anymore (Submit button
    // is type=button with explicit onClick, Enter is handled in onKeyDown).
    e.preventDefault();
  }

  async function logout() {
    try {
      await fetch(`/api/portal/${eventSlug}/logout`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // best effort
    }
    router.replace(`/portal/${eventSlug}`);
  }

  function renderField(field: FormField) {
    const label = field.label;
    const placeholder = field.placeholder;
    const value = formValues[field.name] ?? "";
    const widthClass =
      field.width === "HALF" || field.width === "THIRD"
        ? "col-span-1"
        : "col-span-2";

    if (["HEADING", "DIVIDER", "PARAGRAPH"].includes(field.type)) {
      if (field.type === "HEADING") {
        return (
          <div key={field.id} className="col-span-2 pt-4">
            <h3 className="text-lg font-semibold">{label}</h3>
          </div>
        );
      }
      if (field.type === "DIVIDER") {
        return (
          <hr key={field.id} className="col-span-2 my-4 border-gray-200" />
        );
      }
      return (
        <p key={field.id} className="col-span-2 text-sm text-gray-500">
          {label}
        </p>
      );
    }

    if (field.type === "HIDDEN") {
      return (
        <input
          key={field.id}
          type="hidden"
          name={field.name}
          value={value as string}
        />
      );
    }

    return (
      <div key={field.id} className={`space-y-1.5 ${widthClass}`}>
        <Label htmlFor={field.name} className="text-xs font-medium text-gray-500">
          {label} {field.required && <span className="text-red-400">*</span>}
        </Label>
        {["TEXT", "EMAIL", "PHONE", "NUMBER", "PHONE_COUNTRY"].includes(
          field.type
        ) && (
          <Input
            id={field.name}
            name={field.name}
            type={
              field.type === "EMAIL"
                ? "email"
                : field.type === "NUMBER"
                ? "number"
                : "text"
            }
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={placeholder}
            required={field.required}
            disabled={readOnly}
          />
        )}
        {field.type === "TEXTAREA" && (
          <Textarea
            id={field.name}
            name={field.name}
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={placeholder}
            required={field.required}
            rows={3}
            disabled={readOnly}
          />
        )}
        {field.type === "SELECT" && (
          <Select
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue placeholder={placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {field.type === "COUNTRY" && (
          <Select
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue placeholder={placeholder || "Select country..."} />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {field.type === "RADIO" && (
          <RadioGroup
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            className="flex flex-wrap gap-4"
            disabled={readOnly}
          >
            {(field.options || []).map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={option.value}
                  id={`${field.name}-${option.value}`}
                />
                <Label
                  htmlFor={`${field.name}-${option.value}`}
                  className="text-sm"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
        {field.type === "CHECKBOX" && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value as boolean}
              onCheckedChange={(checked) =>
                handleFieldChange(field.name, !!checked)
              }
              disabled={readOnly}
            />
            <Label htmlFor={field.name} className="text-sm">
              {placeholder || label}
            </Label>
          </div>
        )}
        {field.type === "MULTISELECT" && (
          <div className="flex flex-wrap gap-2">
            {(field.options || []).map((option) => {
              const arr = Array.isArray(value) ? (value as string[]) : [];
              const selected = arr.includes(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  disabled={readOnly}
                  onClick={() => {
                    const next = selected
                      ? arr.filter((v) => v !== option.value)
                      : [...arr, option.value];
                    handleFieldChange(field.name, next);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selected
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
        {field.type === "DATE" && (
          <Input
            id={field.name}
            name={field.name}
            type="date"
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            disabled={readOnly}
          />
        )}
        {field.type === "TIME" && (
          <Input
            id={field.name}
            name={field.name}
            type="time"
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            disabled={readOnly}
          />
        )}
        {field.type === "DATETIME" && (
          <Input
            id={field.name}
            name={field.name}
            type="datetime-local"
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            disabled={readOnly}
          />
        )}
      </div>
    );
  }

  const branding = event?.branding ?? null;
  const primaryColor = branding?.primaryColor || "#7dc242";
  const backgroundColor = branding?.backgroundColor || "#ffffff";
  const textColor = branding?.textColor || "#111827";
  const logoUrl = branding?.logoUrl || null;
  const customStyles = branding?.customCss ? (
    <style dangerouslySetInnerHTML={{ __html: branding.customCss }} />
  ) : null;

  if (pageLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (success) {
    return (
      <>
        {customStyles}
        <div
          className="min-h-screen flex items-center justify-center px-4"
          style={{ backgroundColor }}
        >
          <div className="max-w-md text-center space-y-6">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={event?.name ?? ""}
                className="max-h-12 mx-auto mb-4"
              />
            )}
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: `${primaryColor}20` }}
            >
              <CheckCircle className="h-8 w-8" style={{ color: primaryColor }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: textColor }}>
                Saved
              </h1>
              <p className="text-muted-foreground mt-1">
                Your response to &ldquo;{phase?.title}&rdquo; has been submitted.
                You can come back and edit it anytime until the phase closes.
              </p>
            </div>
            <Button
              asChild
              style={{ backgroundColor: primaryColor, color: "#fff" }}
            >
              <Link
                href={`/portal/${eventSlug}`}
              >
                Back to portal
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (!phase) {
    return (
      <>
        {customStyles}
        <div
          className="min-h-screen flex items-center justify-center px-4"
          style={{ backgroundColor }}
        >
          <div className="max-w-md text-center space-y-4">
            <p className="text-red-500">{error || "Phase not found"}</p>
            <Button asChild variant="outline">
              <Link href={`/portal/${eventSlug}`}>Back to portal</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {customStyles}
      <div className="min-h-screen" style={{ backgroundColor }}>
        <div className="h-1.5 w-full" style={{ backgroundColor: primaryColor }} />
        <div className="py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {logoUrl && (
            <div className="flex justify-center">
              <img
                src={logoUrl}
                alt={event?.name ?? ""}
                className="max-h-12"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Link
              href={`/portal/${eventSlug}`}
              className="text-sm text-muted-foreground inline-flex items-center hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to portal
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={logout}
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> Log out
            </Button>
          </div>

          <div className="rounded-xl border bg-white p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">{phase.title}</h1>
            {phase.status === "LOCKED" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
                <LockIcon className="h-3 w-3" /> Locked
              </span>
            )}
            {phase.status === "CLOSED" && (
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
                View only
              </span>
            )}
          </div>
          {phase.description && (
            <p className="text-sm text-muted-foreground">{phase.description}</p>
          )}
          {phase.closesAt && phase.status === "OPEN" && (
            <p className="text-xs text-muted-foreground">
              Closes {new Date(phase.closesAt).toLocaleString()}
            </p>
          )}
          {submission && (
            <p className="text-xs text-green-700">
              Submitted {new Date(submission.submittedAt).toLocaleString()}
              {submission.updatedAt !== submission.submittedAt && (
                <>
                  {" · "}last edited{" "}
                  {new Date(submission.updatedAt).toLocaleString()}
                </>
              )}
            </p>
          )}

          {/* Stage 3: options card sits above the stepper, mode-dependent. */}
          {phase.selectionMode !== "NONE" && (
            <div ref={optionsCardRef}>
              <PhaseOptionsCard
                selectionMode={phase.selectionMode}
                maxSelections={phase.maxSelections}
                allowChangeAfterSubmit={phase.allowChangeAfterSubmit}
                phaseRequiresReceiptUpload={phase.requiresReceiptUpload}
                options={phase.options}
                selections={selections}
                selectedOptionIds={selectedOptionIds}
                onChange={setSelectedOptionIds}
                isEditing={isEditingSelections}
                onStartEditing={() => {
                  setIsEditingSelections(true);
                  setError("");
                }}
                readOnly={readOnly}
              />
            </div>
          )}

          {isMultiStep && (
            <div className="pt-2">
              <div className="flex items-center gap-2">
                {phase.steps.map((step, idx) => {
                  const isActive = idx === currentStep;
                  const isComplete = idx < currentStep;
                  return (
                    <div
                      key={step.id}
                      className="flex-1 flex items-center gap-2"
                    >
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border transition-colors ${
                          isActive || isComplete
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-transparent border-gray-300 text-gray-500"
                        }`}
                      >
                        {isComplete ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      {idx < phase.steps.length - 1 && (
                        <div
                          className={`flex-1 h-px ${
                            isComplete ? "bg-primary" : "bg-gray-200"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Step {currentStep + 1} of {totalSteps} ·{" "}
                <span className="font-medium">{activeStep?.title ?? ""}</span>
              </p>
              {activeStep?.description && (
                <p className="text-xs text-gray-500 mt-1">
                  {activeStep.description}
                </p>
              )}
            </div>
          )}

          <form
            onSubmit={onFormSubmit}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.target as HTMLElement).tagName !== "TEXTAREA"
              ) {
                e.preventDefault();
                if (isMultiStep && !isLastStep) {
                  goNext();
                } else {
                  performSubmit();
                }
              }
            }}
            noValidate
            className="space-y-5"
          >
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {visibleFields.map((field) => renderField(field))}
            </div>

            {!readOnly && (
              isMultiStep ? (
                <div className="flex items-center gap-3 pt-2">
                  {!isFirstStep && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goBack}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                  )}
                  {isLastStep ? (
                    <Button
                      type="button"
                      onClick={performSubmit}
                      className="flex-1"
                      disabled={submitting}
                      style={{ backgroundColor: primaryColor, color: "#fff" }}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : submission ? (
                        "Update"
                      ) : (
                        "Submit"
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={goNext}
                      className="flex-1"
                      style={{ backgroundColor: primaryColor, color: "#fff" }}
                    >
                      Next <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={performSubmit}
                  className="w-full"
                  disabled={submitting}
                  style={{ backgroundColor: primaryColor, color: "#fff" }}
                >
                  {submitting ? "Saving…" : submission ? "Update" : "Submit"}
                </Button>
              )
            )}
          </form>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
