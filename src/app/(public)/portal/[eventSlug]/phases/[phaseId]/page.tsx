"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  resolveOtherPlaceholder,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PhaseSelectionMode } from "@prisma/client";
import {
  PhaseOptionsCard,
  type PortalPhaseOption,
  type PortalPhaseSelection,
} from "./phase-options-card";
import { pickText, type PortalLang } from "@/lib/portal/i18n";

// ─── Page-local bilingual strings ─────────────────────────────────────
//
// Kept inline rather than in a shared i18n module — the portal post-
// login flow doesn't have a translation infrastructure yet, and the
// surface area is small. If a third language ever lands, lift this
// out to src/lib/i18n/.
const PAGE_STRINGS = {
  en: {
    backToPortal: "Back to portal",
    logout: "Log out",
    locked: "Locked",
    closed: "View only",
    closes: (when: string) => `Closes ${when}`,
    submittedAt: (when: string) => `Submitted ${when}`,
    lastEdited: (when: string) => `last edited ${when}`,
    stepLabel: (n: number, total: number) => `Step ${n} of ${total}`,
    requiredFields:
      "Please complete the required fields before continuing.",
    submissionFailed: "Submission failed",
    networkFailed:
      "Submission failed. Check your connection and try again.",
    optionFullFallback:
      "An option you picked just filled up. Please pick another and resubmit.",
    selectionsConcurrency:
      "Your selection was updated elsewhere. Reloading the latest…",
    saving: "Saving…",
    submit: "Submit",
    update: "Update",
    next: "Next",
    back: "Back",
    saved: "Saved",
    savedBody: (title: string) =>
      `Your response to "${title}" has been submitted. You can come back and edit it anytime until the phase closes.`,
    pleaseSpecify: "Please specify",
    pleaseSpecifyError: "Please specify your answer",
    counterBelow: (n: number, max: number) => `${n} of ${max} selected`,
    counterAtLimit: (max: number) => `Maximum reached — ${max} of ${max}`,
    maxReachedTooltip: (max: number) =>
      `Maximum ${max} selections reached. Uncheck one to choose a different option.`,
    languageToggle: "العربية",
  },
  ar: {
    backToPortal: "العودة إلى البوابة",
    logout: "تسجيل الخروج",
    locked: "مقفل",
    closed: "عرض فقط",
    closes: (when: string) => `تُغلق في ${when}`,
    submittedAt: (when: string) => `أُرسل في ${when}`,
    lastEdited: (when: string) => `آخر تعديل ${when}`,
    stepLabel: (n: number, total: number) => `الخطوة ${n} من ${total}`,
    requiredFields:
      "يُرجى إكمال الحقول المطلوبة قبل المتابعة.",
    submissionFailed: "فشل الإرسال",
    networkFailed: "فشل الإرسال. تحقق من اتصالك وحاول مرة أخرى.",
    optionFullFallback:
      "أحد الخيارات التي اخترتها أصبح ممتلئًا. يُرجى اختيار خيار آخر وإعادة الإرسال.",
    selectionsConcurrency:
      "تم تحديث اختيارك من مكان آخر. جارٍ إعادة تحميل أحدث نسخة…",
    saving: "جارٍ الحفظ…",
    submit: "إرسال",
    update: "تحديث",
    next: "التالي",
    back: "رجوع",
    saved: "تم الحفظ",
    savedBody: (title: string) =>
      `تم إرسال إجابتك على "${title}". يمكنك الرجوع وتعديلها في أي وقت قبل إغلاق المرحلة.`,
    pleaseSpecify: "يرجى التحديد",
    pleaseSpecifyError: "يرجى تحديد إجابتك",
    counterBelow: (n: number, max: number) => `${n} من ${max} محدد`,
    counterAtLimit: (max: number) =>
      `تم بلوغ الحد الأقصى — ${max} من ${max}`,
    maxReachedTooltip: (max: number) =>
      `تم بلوغ الحد الأقصى ${max}. ألغِ خيارًا لاختيار آخر.`,
    languageToggle: "English",
  },
} as const;

interface PortalOtherTextInputProps {
  fieldName: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  required: boolean;
}

function PortalOtherTextInput({
  fieldName,
  value,
  onChange,
  label,
  placeholder,
  required,
}: PortalOtherTextInputProps) {
  return (
    <div className="mt-2 space-y-1">
      <Label
        htmlFor={`${fieldName}${OTHER_SUFFIX}`}
        className="text-xs font-medium text-muted-foreground"
      >
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={`${fieldName}${OTHER_SUFFIX}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

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
  multiLanguage?: boolean;
}

type PhaseCompletionStatus =
  | "NOT_STARTED"
  | "PARTIALLY_COMPLETE"
  | "COMPLETE"
  | "PENDING_ASSIGNMENT";

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

  // Language preference. Hydrates from localStorage on mount, then
  // tracks the toggle button. We store it per portal so each event's
  // language can be remembered independently. Default = "en"; the
  // useEffect below promotes to "ar" if the event has multiLanguage on
  // and the attendee hasn't set an explicit preference yet.
  const [lang, setLang] = useState<PortalLang>("en");
  const langStorageKey = `portal-lang:${eventSlug}`;
  const t = PAGE_STRINGS[lang];
  const isRtl = lang === "ar";
  const localeTag = lang === "ar" ? "ar-SA" : undefined;

  const totalSteps = phase?.steps.length ?? 0;
  const isMultiStep = totalSteps > 1;
  const activeStep = phase?.steps[currentStep] ?? null;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const readOnly = phase?.status === "CLOSED" || phase?.status === "LOCKED";

  // Refetch the phase from the API. Used both on mount and after
  // mutations (selection submit, receipt upload, receipt delete) so
  // the UI always reflects the latest server state. We deliberately
  // DON'T re-seed form values or the user's lang choice on a refetch
  // — those represent user intent that shouldn't be overwritten.
  // `seedFromScratch` is set on the first mount call so the initial
  // page render gets all the seeding logic.
  //
  // Returns the freshly-fetched data so callers can act on it
  // immediately (e.g. performSubmit checks completionStatus to
  // decide whether to flip into the fullscreen success view).
  const refetchPhase = useCallback(
    async (
      seedFromScratch = false
    ): Promise<{
      phase: PhaseData;
      submission: SubmissionData | null;
      selections: PortalPhaseSelection[];
      selectionsUpdatedAt: string | null;
      completionStatus: PhaseCompletionStatus | null;
    } | null> => {
      try {
        const url = `/api/portal/${eventSlug}/phases/${phaseId}`;
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.status === 401) {
          router.replace(`/portal/${eventSlug}`);
          return null;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load phase");
          if (seedFromScratch) setPageLoading(false);
          return null;
        }
        const p: PhaseData = data.phase;
        const sub: SubmissionData | null = data.submission;
        const sels: PortalPhaseSelection[] = data.selections ?? [];
        const selUpdatedAt: string | null = data.selectionsUpdatedAt ?? null;
        const completionStatus: PhaseCompletionStatus | null =
          data.completionStatus ?? null;
        setPhase(p);
        setEvent(data.event ?? null);
        setSubmission(sub);
        setSelections(sels);
        setSelectionsUpdatedAt(selUpdatedAt);

        if (seedFromScratch) {
          // Hydrate language preference (mount-only — toggling later
          // shouldn't get overridden by a refetch). Prior choice in
          // localStorage wins; otherwise default Arabic when
          // multiLanguage is on.
          try {
            const stored = window.localStorage.getItem(
              `portal-lang:${eventSlug}`
            );
            if (stored === "ar" || stored === "en") {
              setLang(stored);
            } else if (data.event?.multiLanguage) {
              setLang("ar");
            }
          } catch {
            if (data.event?.multiLanguage) setLang("ar");
          }

          // Seed selectedOptionIds + initial editing flag.
          const attendeeSelectedIds = sels
            .filter((s) => s.source === "ATTENDEE_PICKED")
            .map((s) => s.optionId);
          setSelectedOptionIds(attendeeSelectedIds);
          setIsEditingSelections(attendeeSelectedIds.length === 0);

          // Seed form values from saved submission or field defaults.
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
        }

        return {
          phase: p,
          submission: sub,
          selections: sels,
          selectionsUpdatedAt: selUpdatedAt,
          completionStatus,
        };
      } catch {
        setError("Failed to load phase");
        return null;
      } finally {
        if (seedFromScratch) setPageLoading(false);
      }
    },
    [eventSlug, phaseId, router]
  );

  useEffect(() => {
    void refetchPhase(true);
  }, [refetchPhase]);

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

  function toggleLang() {
    const next: PortalLang = lang === "ar" ? "en" : "ar";
    setLang(next);
    try {
      window.localStorage.setItem(langStorageKey, next);
    } catch {
      // localStorage unavailable; keep in-memory choice.
    }
  }

  // Bilingual field helpers — pick Arabic variant when available, fall
  // back to English. Used by renderField and the stepper UI.
  function fieldLabel(field: FormField): string {
    return pickText(lang, field.label, field.labelAr);
  }
  function fieldPlaceholder(field: FormField): string {
    return pickText(lang, field.placeholder, field.placeholderAr);
  }
  function fieldHelpText(field: FormField): string {
    return pickText(lang, field.helpText, field.helpTextAr);
  }
  function fieldOptionLabel(o: {
    label: string;
    labelAr?: string | null;
  }): string {
    return pickText(lang, o.label, o.labelAr ?? undefined);
  }
  function stepTitle(s: FormStep): string {
    return pickText(lang, s.title, s.titleAr);
  }
  function stepDescription(s: FormStep): string {
    return pickText(lang, s.description, s.descriptionAr);
  }

  function validateCurrentStep(): boolean {
    if (!activeStep) return false;
    for (const field of activeStep.fields) {
      const visible = isFieldVisible(field.conditional, formValues);
      const value = formValues[field.name];

      if (field.required && visible) {
        const empty =
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0);
        if (empty) {
          setError(t.requiredFields);
          return false;
        }
      }

      if (visible && field.required) {
        const selectedOther =
          value === OTHER_VALUE ||
          (Array.isArray(value) && (value as string[]).includes(OTHER_VALUE));
        if (selectedOther) {
          const sibling = formValues[`${field.name}${OTHER_SUFFIX}`];
          const text = typeof sibling === "string" ? sibling.trim() : "";
          if (!text) {
            setError(t.pleaseSpecifyError);
            return false;
          }
        }
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

        // Stage 4: only show the fullscreen "Saved" overlay when the
        // phase is fully COMPLETE. If receipts are required and still
        // pending, the page stays put so the receipt-upload UI in the
        // SubmittedSelectionCard is visible — the user has more to do.
        // We refetch first to get the authoritative completionStatus
        // (the PUT response doesn't include it, since selections were
        // just written and their receipts can't have arrived yet).
        const refreshed = await refetchPhase();
        if (refreshed?.completionStatus === "COMPLETE") {
          setSuccess(true);
        }
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
        // Server's friendly message wins (it names the specific option),
        // but fall back to the localised generic if the server text is
        // missing or in the wrong language for some reason.
        setError(result.error || t.optionFullFallback);
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
        setError(t.selectionsConcurrency);
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

      // Server caught an empty Other custom text on a required field —
      // render the localized copy instead of the English fallback.
      if (result.code === "OTHER_TEXT_REQUIRED") {
        setError(t.pleaseSpecifyError);
        return;
      }

      // Generic non-OK: surface the server's message.
      setError(result.error || t.submissionFailed);
    } catch {
      setError(t.networkFailed);
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
    const label = fieldLabel(field);
    const placeholder = fieldPlaceholder(field);
    const helpText = fieldHelpText(field);
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
        {helpText && (
          <p className="text-xs text-muted-foreground">{helpText}</p>
        )}
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
        {field.type === "SELECT" && (() => {
          const parsed = parseFormFieldOptions(field.options);
          const otherSelected = (value as string) === OTHER_VALUE;
          return (
            <>
              <Select
                value={value as string}
                onValueChange={(v) => {
                  handleFieldChange(field.name, v);
                  if (v !== OTHER_VALUE) {
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
                  }
                }}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      placeholder || (lang === "ar" ? "اختر..." : "Select...")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {parsed.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {fieldOptionLabel(option)}
                    </SelectItem>
                  ))}
                  {parsed.other && (
                    <SelectItem value={OTHER_VALUE}>
                      {resolveOtherLabel(parsed.other, lang)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {parsed.other && otherSelected && !readOnly && (
                <PortalOtherTextInput
                  fieldName={field.name}
                  value={
                    (formValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
                  }
                  onChange={(v) =>
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, v)
                  }
                  label={t.pleaseSpecify}
                  placeholder={resolveOtherPlaceholder(parsed.other, lang)}
                  required={field.required}
                />
              )}
            </>
          );
        })()}
        {field.type === "COUNTRY" && (
          <Select
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  placeholder ||
                  (lang === "ar" ? "اختر الدولة..." : "Select country...")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {lang === "ar" ? country.nameAr : country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {field.type === "RADIO" && (() => {
          const parsed = parseFormFieldOptions(field.options);
          const otherSelected = (value as string) === OTHER_VALUE;
          return (
            <>
              <RadioGroup
                value={value as string}
                onValueChange={(v) => {
                  handleFieldChange(field.name, v);
                  if (v !== OTHER_VALUE) {
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
                  }
                }}
                className="flex flex-wrap gap-4"
                disabled={readOnly}
              >
                {parsed.options.map((option) => (
                  <div
                    key={option.value}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`${field.name}-${option.value}`}
                    />
                    <Label
                      htmlFor={`${field.name}-${option.value}`}
                      className="text-sm"
                    >
                      {fieldOptionLabel(option)}
                    </Label>
                  </div>
                ))}
                {parsed.other && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={OTHER_VALUE}
                      id={`${field.name}-${OTHER_VALUE}`}
                    />
                    <Label
                      htmlFor={`${field.name}-${OTHER_VALUE}`}
                      className="text-sm"
                    >
                      {resolveOtherLabel(parsed.other, lang)}
                    </Label>
                  </div>
                )}
              </RadioGroup>
              {parsed.other && otherSelected && !readOnly && (
                <PortalOtherTextInput
                  fieldName={field.name}
                  value={
                    (formValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
                  }
                  onChange={(v) =>
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, v)
                  }
                  label={t.pleaseSpecify}
                  placeholder={resolveOtherPlaceholder(parsed.other, lang)}
                  required={field.required}
                />
              )}
            </>
          );
        })()}
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
        {field.type === "MULTISELECT" && (() => {
          const parsed = parseFormFieldOptions(field.options);
          const arr = Array.isArray(value) ? (value as string[]) : [];
          const max = parsed.maxSelections;
          const atLimit =
            typeof max === "number" && max > 0 && arr.length >= max;
          const showCounter =
            typeof max === "number" &&
            max > 0 &&
            parsed.showSelectionCounter !== false;
          const otherSelected = arr.includes(OTHER_VALUE);

          const renderPill = (optionValue: string, labelText: string) => {
            const selected = arr.includes(optionValue);
            const disabled = !selected && atLimit;
            const onClick = () => {
              if (readOnly || disabled) return;
              const next = selected
                ? arr.filter((v) => v !== optionValue)
                : [...arr, optionValue];
              handleFieldChange(field.name, next);
              if (selected && optionValue === OTHER_VALUE) {
                handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
              }
            };
            const btn = (
              <button
                type="button"
                key={optionValue}
                aria-disabled={readOnly || disabled}
                onClick={onClick}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selected
                    ? "border-transparent bg-primary text-primary-foreground"
                    : disabled
                    ? "border-gray-200 bg-gray-50/50 text-gray-400 cursor-not-allowed opacity-60"
                    : "border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {labelText}
              </button>
            );
            if (!disabled || typeof max !== "number") return btn;
            return (
              <Tooltip key={optionValue}>
                <TooltipTrigger asChild>
                  <span>{btn}</span>
                </TooltipTrigger>
                <TooltipContent>{t.maxReachedTooltip(max)}</TooltipContent>
              </Tooltip>
            );
          };

          return (
            <TooltipProvider delayDuration={150}>
              <div className="flex flex-wrap gap-2">
                {parsed.options.map((option) =>
                  renderPill(option.value, fieldOptionLabel(option))
                )}
                {parsed.other &&
                  renderPill(
                    OTHER_VALUE,
                    resolveOtherLabel(parsed.other, lang)
                  )}
              </div>
              {showCounter && (
                <p
                  className={`mt-2 text-xs ${
                    atLimit ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {atLimit
                    ? t.counterAtLimit(max!)
                    : t.counterBelow(arr.length, max!)}
                </p>
              )}
              {parsed.other && otherSelected && !readOnly && (
                <PortalOtherTextInput
                  fieldName={field.name}
                  value={
                    (formValues[`${field.name}${OTHER_SUFFIX}`] as string) ?? ""
                  }
                  onChange={(v) =>
                    handleFieldChange(`${field.name}${OTHER_SUFFIX}`, v)
                  }
                  label={t.pleaseSpecify}
                  placeholder={resolveOtherPlaceholder(parsed.other, lang)}
                  required={field.required}
                />
              )}
            </TooltipProvider>
          );
        })()}
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
          dir={isRtl ? "rtl" : "ltr"}
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
                {t.saved}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t.savedBody(pickText(lang, phase?.title, phase?.titleAr))}
              </p>
            </div>
            <Button
              asChild
              style={{ backgroundColor: primaryColor, color: "#fff" }}
            >
              <Link href={`/portal/${eventSlug}`}>{t.backToPortal}</Link>
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
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="max-w-md text-center space-y-4">
            <p className="text-red-500">
              {error ||
                (lang === "ar" ? "المرحلة غير موجودة" : "Phase not found")}
            </p>
            <Button asChild variant="outline">
              <Link href={`/portal/${eventSlug}`}>{t.backToPortal}</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {customStyles}
      <div
        className="min-h-screen"
        style={{ backgroundColor }}
        dir={isRtl ? "rtl" : "ltr"}
      >
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
              <ArrowLeft
                className={`h-4 w-4 ${isRtl ? "ml-1 rotate-180" : "mr-1"}`}
              />{" "}
              {t.backToPortal}
            </Link>
            <div className="flex items-center gap-2">
              {/* Language toggle — only when the event opted into multi-
                  language. The toggle's label is the OTHER language's
                  name in its own script, the standard pattern. */}
              {event?.multiLanguage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleLang}
                  aria-label={
                    lang === "ar"
                      ? "Switch to English"
                      : "التبديل إلى العربية"
                  }
                >
                  {t.languageToggle}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={logout}
              >
                <LogOut className="h-3.5 w-3.5 mr-1" /> {t.logout}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">
              {pickText(lang, phase.title, phase.titleAr)}
            </h1>
            {phase.status === "LOCKED" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
                <LockIcon className="h-3 w-3" /> {t.locked}
              </span>
            )}
            {phase.status === "CLOSED" && (
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
                {t.closed}
              </span>
            )}
          </div>
          {pickText(lang, phase.description, phase.descriptionAr) && (
            <p className="text-sm text-muted-foreground">
              {pickText(lang, phase.description, phase.descriptionAr)}
            </p>
          )}
          {phase.closesAt && phase.status === "OPEN" && (
            <p className="text-xs text-muted-foreground">
              {t.closes(new Date(phase.closesAt).toLocaleString(localeTag))}
            </p>
          )}
          {submission && (
            <p className="text-xs text-green-700">
              {t.submittedAt(
                new Date(submission.submittedAt).toLocaleString(localeTag)
              )}
              {submission.updatedAt !== submission.submittedAt && (
                <>
                  {" · "}
                  {t.lastEdited(
                    new Date(submission.updatedAt).toLocaleString(localeTag)
                  )}
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
                lang={lang}
                eventSlug={eventSlug}
                phaseId={phaseId}
                onReceiptChange={async () => {
                  await refetchPhase();
                }}
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
                {t.stepLabel(currentStep + 1, totalSteps)} ·{" "}
                <span className="font-medium">
                  {activeStep ? stepTitle(activeStep) : ""}
                </span>
              </p>
              {activeStep && stepDescription(activeStep) && (
                <p className="text-xs text-gray-500 mt-1">
                  {stepDescription(activeStep)}
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
                      <ArrowLeft
                        className={`h-4 w-4 ${isRtl ? "ml-1 rotate-180" : "mr-1"}`}
                      />{" "}
                      {t.back}
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
                          {t.saving}
                        </>
                      ) : submission ? (
                        t.update
                      ) : (
                        t.submit
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={goNext}
                      className="flex-1"
                      style={{ backgroundColor: primaryColor, color: "#fff" }}
                    >
                      {t.next}{" "}
                      <ArrowRight
                        className={`h-4 w-4 ${isRtl ? "mr-1 rotate-180" : "ml-1"}`}
                      />
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
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t.saving}
                    </>
                  ) : submission ? (
                    t.update
                  ) : (
                    t.submit
                  )}
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
