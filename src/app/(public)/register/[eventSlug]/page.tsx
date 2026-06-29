"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CheckCircle,
  Globe,
  CalendarDays,
  MapPin,
  Clock,
  Loader2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { COUNTRIES } from "@/lib/form-builder/countries";
import { isFieldVisible } from "@/lib/form-conditional";
import { prefersWhiteText, readableTextColor } from "@/lib/color-contrast";
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
import { FileUploadControl } from "@/components/public/file-upload-control";
import { parseFileFieldMetadata } from "@/lib/validations/file-field-metadata";
import { SectionHeading } from "@/components/public/section-heading";
import { parseHeadingColor } from "@/lib/form-builder/heading-meta";

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
  optionColumns?: "AUTO" | "ONE" | "TWO";
  section?: string;
  conditional?: Record<string, unknown>;
  isSystem: boolean;
  defaultValue?: string;
  // FILE fields carry { maxSizeMB, allowedMimeTypes } here. Other types
  // may leave it null/undefined. Always read via parseFileFieldMetadata.
  metadata?: unknown;
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

interface Branding {
  primaryColor: string;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  logoWhiteUrl?: string | null;
  headerImageUrl?: string | null;
  headerColor?: string | null;
  headerShowLogo?: boolean | null;
  logoHeight?: number | null;
  welcomeTitle?: string | null;
  welcomeTitleAr?: string | null;
  welcomeMessage?: string | null;
  welcomeMessageAr?: string | null;
  footerText?: string | null;
  footerTextAr?: string | null;
  customCss?: string | null;
}

interface EventData {
  eventName: string;
  eventDescription?: string | null;
  venue?: string | null;
  startDate: string;
  endDate: string;
  branding?: Branding | null;
  steps: FormStep[];
  contact?: Record<string, string | null>;
}

// FILE fields store the denormalized upload ref directly under the
// field name; non-FILE types continue to use the original primitive
// shapes. The submission handler reads either shape per field type.
type UploadedFileRef = {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};
type FormFieldValue = string | boolean | string[] | UploadedFileRef | null;
type FormValueMap = Record<string, FormFieldValue>;

interface DraftPayload {
  currentStep: number;
  formValues: FormValueMap;
  savedAt: string;
}

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Crisp registration-form input style: white bg, soft border, green
// focus ring driven by brand green (#7EC43F). Shared across all
// inputs/textarea/date-time on the public registration page so the
// look stays consistent and there's one literal to edit, not seven.
// Textarea callers override h-[46px] with h-auto + min-h to keep the
// component multi-line.
const INPUT_CLASSES =
  "bg-white border-[#e3e4e8] rounded-[11px] h-[46px] transition-colors focus-visible:border-[#7EC43F] focus-visible:ring-[#7EC43F]/15 focus-visible:ring-[3px] focus-visible:ring-offset-0";

// SelectTrigger variant: same crisp look, but shadcn's SelectTrigger
// handles its own transitions and doesn't need focus:bg-white. Kept
// structurally separate from INPUT_CLASSES because Select is a
// button-like trigger, not an <input>.
const SELECT_TRIGGER_CLASSES =
  "bg-white border-[#e3e4e8] rounded-[11px] h-[46px] focus-visible:border-[#7EC43F] focus-visible:ring-[#7EC43F]/15 focus-visible:ring-[3px] focus-visible:ring-offset-0";

interface OtherTextInputProps {
  fieldName: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  required: boolean;
}

function OtherTextInput({
  fieldName,
  value,
  onChange,
  label,
  placeholder,
  required,
}: OtherTextInputProps) {
  return (
    <div className="mt-2 space-y-1">
      <Label
        htmlFor={`${fieldName}${OTHER_SUFFIX}`}
        className="text-xs font-medium text-gray-500"
      >
        {label} {required && <span className="text-red-400">*</span>}
      </Label>
      <Input
        id={`${fieldName}${OTHER_SUFFIX}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASSES}
      />
    </div>
  );
}

const translations = {
  ar: {
    title: "تسجيل الحضور",
    description: "يرجى تعبئة بياناتك للتسجيل",
    register: "تأكيد التسجيل",
    registering: "جاري التسجيل...",
    successTitle: "تم التسجيل بنجاح!",
    successMessage: "شكراً لتسجيلك. نتطلع لرؤيتك هناك!",
    switchLang: "English",
    loading: "جاري التحميل...",
    eventNotFound: "الفعالية غير موجودة",
    required: "مطلوب",
    next: "التالي",
    back: "السابق",
    stepOf: (current: number, total: number) => `الخطوة ${current} من ${total}`,
    draftRestored: "تم استرجاع بياناتك من زيارتك السابقة.",
    startOver: "البدء من جديد",
    fillRequired: "يرجى إكمال الحقول المطلوبة قبل المتابعة.",
    pleaseSpecify: "يرجى التحديد",
    pleaseSpecifyError: "يرجى تحديد إجابتك",
    networkError:
      "تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.",
    counterBelow: (n: number, max: number) => `${n} من ${max} محدد`,
    counterAtLimit: (max: number) =>
      `تم بلوغ الحد الأقصى — ${max} من ${max}`,
    maxReachedTooltip: (max: number) =>
      `تم بلوغ الحد الأقصى ${max}. ألغِ خيارًا لاختيار آخر.`,
  },
  en: {
    title: "Event Registration",
    description: "Fill in your details to register",
    register: "Confirm Registration",
    registering: "Registering...",
    successTitle: "Registration Successful!",
    successMessage: "Thank you for registering. We look forward to seeing you there!",
    switchLang: "العربية",
    loading: "Loading...",
    eventNotFound: "Event not found",
    required: "Required",
    next: "Next",
    back: "Back",
    stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
    draftRestored: "Resumed from your last visit.",
    startOver: "Start over",
    fillRequired: "Please complete the required fields before continuing.",
    pleaseSpecify: "Please specify",
    pleaseSpecifyError: "Please specify your answer",
    networkError:
      "Could not reach the server. Please check your connection and try again.",
    counterBelow: (n: number, max: number) => `${n} of ${max} selected`,
    counterAtLimit: (max: number) => `Maximum reached — ${max} of ${max}`,
    maxReachedTooltip: (max: number) =>
      `Maximum ${max} selections reached. Uncheck one to choose a different option.`,
  },
};

// MULTISELECT card-grid column classes per FormField.optionColumns (Feature B).
// Static literal strings (no interpolation) so Tailwind's JIT scanner emits
// every class — especially the bare `grid-cols-2` used only here.
const OPTION_COLS: Record<"AUTO" | "ONE" | "TWO", string> = {
  AUTO: "grid-cols-1 sm:grid-cols-2",
  ONE: "grid-cols-1",
  TWO: "grid-cols-2",
};

export default function RegisterPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventSlug = params.eventSlug as string;
  const token = searchParams.get("token");
  const draftKey = `registration-draft:${eventSlug}`;

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [formValues, setFormValues] = useState<FormValueMap>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);

  const t = translations[lang];
  const isRtl = lang === "ar";
  const branding = eventData?.branding;

  const primaryColor = branding?.primaryColor || "#6abf4b";
  const backgroundColor = branding?.backgroundColor || "#ffffff";
  const textColor = branding?.textColor || "#000000";

  const steps = eventData?.steps ?? [];
  const totalSteps = steps.length;
  const isMultiStep = totalSteps > 1;
  const activeStep = steps[currentStep] ?? null;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;

  // ── Initial load: fetch event + restore draft if present ─────────────
  useEffect(() => {
    async function fetchEventData() {
      try {
        const url = token
          ? `/api/register/${eventSlug}?token=${token}`
          : `/api/register/${eventSlug}`;

        const res = await fetch(url);

        if (res.ok) {
          const data: EventData = await res.json();
          setEventData(data);

          const allFields = data.steps.flatMap((s) => s.fields);
          const initial: FormValueMap = {};
          for (const field of allFields) {
            if (data.contact && data.contact[field.name]) {
              initial[field.name] = data.contact[field.name] as string;
            } else if (field.defaultValue) {
              initial[field.name] = field.defaultValue;
            } else if (field.type === "CHECKBOX") {
              initial[field.name] = false;
            } else if (field.type === "MULTISELECT") {
              initial[field.name] = [];
            } else if (field.type === "FILE") {
              initial[field.name] = null;
            } else {
              initial[field.name] = "";
            }
          }

          // Restore draft if recent.
          let resumedStep: number | null = null;
          let resumedValues: FormValueMap | null = null;
          if (typeof window !== "undefined") {
            try {
              const raw = window.localStorage.getItem(draftKey);
              if (raw) {
                const parsed: DraftPayload = JSON.parse(raw);
                const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
                if (Number.isFinite(ageMs) && ageMs < DRAFT_TTL_MS) {
                  resumedValues = parsed.formValues;
                  resumedStep = parsed.currentStep;
                } else {
                  window.localStorage.removeItem(draftKey);
                }
              }
            } catch {
              window.localStorage.removeItem(draftKey);
            }
          }

          if (resumedValues) {
            setFormValues({ ...initial, ...resumedValues });
            setDraftRestored(true);
          } else {
            setFormValues(initial);
          }

          // Initial step: prefer ?step= query param if valid, else draft, else 0.
          const stepParam = searchParams.get("step");
          const total = data.steps.length;
          const fromQuery =
            stepParam !== null
              ? Math.max(0, Math.min(total - 1, parseInt(stepParam, 10) - 1))
              : null;
          const fromDraft =
            resumedStep !== null
              ? Math.max(0, Math.min(total - 1, resumedStep))
              : null;
          setCurrentStep(
            (fromQuery !== null && !Number.isNaN(fromQuery))
              ? fromQuery
              : fromDraft ?? 0
          );
        } else {
          setError(t.eventNotFound);
        }
      } catch {
        setError(t.eventNotFound);
      } finally {
        setPageLoading(false);
      }
    }

    fetchEventData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSlug, token]);

  // ── Sync ?step=N to URL when currentStep changes ────────────────────
  useEffect(() => {
    if (pageLoading || totalSteps === 0) return;
    const stepNumber = currentStep + 1;
    const params = new URLSearchParams(searchParams.toString());
    if (isMultiStep) {
      params.set("step", String(stepNumber));
    } else {
      params.delete("step");
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : `?`, { scroll: false });
  }, [currentStep, pageLoading, totalSteps, isMultiStep, router, searchParams]);

  // ── Debounced localStorage draft save ───────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pageLoading || totalSteps === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const payload: DraftPayload = {
          currentStep,
          formValues,
          savedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {
        /* ignore quota errors */
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [formValues, currentStep, pageLoading, totalSteps, draftKey]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  function handleStartOver() {
    clearDraft();
    setDraftRestored(false);
    // Re-init from defaults (refetch is overkill — just reset known keys).
    if (!eventData) return;
    const allFields = eventData.steps.flatMap((s) => s.fields);
    const reset: FormValueMap = {};
    for (const field of allFields) {
      if (field.defaultValue) reset[field.name] = field.defaultValue;
      else if (field.type === "CHECKBOX") reset[field.name] = false;
      else if (field.type === "MULTISELECT") reset[field.name] = [];
      else reset[field.name] = "";
    }
    setFormValues(reset);
    setCurrentStep(0);
  }

  function handleFieldChange(name: string, value: FormFieldValue) {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setError("");
  }

  // ── Step navigation with per-step validation ────────────────────────
  function validateCurrentStep(): boolean {
    if (!activeStep) return false;
    for (const field of activeStep.fields) {
      const visible = isFieldVisible(field.conditional, formValues);
      const value = formValues[field.name];

      if (field.required && visible) {
        // `false` counts as empty: a required CHECKBOX must be checked.
        const empty =
          value === undefined ||
          value === null ||
          value === "" ||
          value === false ||
          (Array.isArray(value) && value.length === 0);
        if (empty) {
          setError(t.fillRequired);
          return false;
        }
      }

      // Other custom text required when Other is selected on a required
      // option-bearing field.
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
    if (isMultiStep && !isLastStep) {
      goNext();
      return;
    }
    if (!validateCurrentStep()) return;
    setLoading(true);
    setError("");

    const url = token
      ? `/api/register/${eventSlug}?token=${token}`
      : `/api/register/${eventSlug}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });

      // Non-JSON error bodies (gateway/edge failures) must not mask the
      // real outcome — fall back to null and the generic message below.
      const result = await res.json().catch(() => null);

      if (res.ok) {
        clearDraft();
        setSuccess(true);
      } else if (result?.code === "OTHER_TEXT_REQUIRED") {
        // Server caught an empty Other custom text on a required field —
        // typically a multi-step path where the broken field wasn't on the
        // current step. Render the localized copy instead of the server's
        // English fallback.
        setError(t.pleaseSpecifyError);
      } else {
        setError(result?.error || "Registration failed");
      }
    } catch {
      // fetch() itself rejected — offline, DNS, aborted. Without this the
      // form stayed on the loading spinner forever.
      setError(t.networkError);
    } finally {
      setLoading(false);
    }
  }

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Defensive — Submit is type=button with onClick, Enter routes through
    // the onKeyDown handler. Nothing should reach this path.
    e.preventDefault();
  }

  // ── Branding helpers ─────────────────────────────────────────────────
  const welcomeTitle = isRtl
    ? (branding?.welcomeTitleAr || branding?.welcomeTitle || t.title)
    : (branding?.welcomeTitle || t.title);

  const welcomeMessage = isRtl
    ? (branding?.welcomeMessageAr || branding?.welcomeMessage || t.description)
    : (branding?.welcomeMessage || t.description);

  const footerText = isRtl
    ? (branding?.footerTextAr || branding?.footerText)
    : (branding?.footerText || branding?.footerTextAr);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(isRtl ? "ar-SA" : "en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(isRtl ? "ar-SA" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  function getFieldLabel(field: FormField) {
    return isRtl && field.labelAr ? field.labelAr : field.label;
  }
  function getFieldPlaceholder(field: FormField) {
    return isRtl && field.placeholderAr
      ? field.placeholderAr
      : field.placeholder;
  }
  function getFieldHelpText(field: FormField): string | null {
    const v = isRtl && field.helpTextAr ? field.helpTextAr : field.helpText;
    return v && v.trim() !== "" ? v : null;
  }
  function getOptionLabel(option: {
    value: string;
    label: string;
    labelAr?: string | null;
  }) {
    return isRtl && option.labelAr ? option.labelAr : option.label;
  }
  function getStepTitle(step: FormStep) {
    return isRtl && step.titleAr ? step.titleAr : step.title;
  }
  function getStepDescription(step: FormStep) {
    return isRtl && step.descriptionAr ? step.descriptionAr : step.description;
  }

  // ── Visible-fields-on-current-step memo (used by renderer) ──────────
  const visibleFields = useMemo(() => {
    if (!activeStep) return [];
    return activeStep.fields.filter((f) =>
      isFieldVisible(f.conditional, formValues)
    );
  }, [activeStep, formValues]);

  function renderField(field: FormField) {
    const label = getFieldLabel(field);
    const placeholder = getFieldPlaceholder(field);
    const value = formValues[field.name] ?? "";
    const widthClass =
      field.width === "HALF"
        ? "col-span-1"
        : field.width === "THIRD"
        ? "col-span-1"
        : "col-span-2";

    if (["HEADING", "DIVIDER", "PARAGRAPH"].includes(field.type)) {
      if (field.type === "HEADING") {
        return (
          <SectionHeading
            key={field.id}
            label={label}
            color={parseHeadingColor(field.metadata)}
            className="col-span-2 mt-6 first:mt-0"
          />
        );
      }
      if (field.type === "DIVIDER") {
        return (
          <hr key={field.id} className="col-span-2 my-4 border-gray-200" />
        );
      }
      if (field.type === "PARAGRAPH") {
        return (
          <p key={field.id} className="col-span-2 text-sm text-gray-500">
            {label}
          </p>
        );
      }
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
        <Label
          htmlFor={field.name}
          className="text-xs font-medium text-gray-500"
        >
          {label}{" "}
          {field.required && <span className="text-red-400">*</span>}
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
            className={INPUT_CLASSES}
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
            className={`${INPUT_CLASSES} h-auto min-h-[88px] py-2.5`}
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
                required={field.required}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASSES}>
                  <SelectValue placeholder={placeholder || "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {parsed.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {getOptionLabel(option)}
                    </SelectItem>
                  ))}
                  {parsed.other && (
                    <SelectItem value={OTHER_VALUE}>
                      {resolveOtherLabel(parsed.other, lang)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {parsed.other && otherSelected && (
                <OtherTextInput
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
            required={field.required}
          >
            <SelectTrigger className={SELECT_TRIGGER_CLASSES}>
              <SelectValue
                placeholder={
                  placeholder ||
                  (isRtl ? "اختر الدولة..." : "Select country...")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {isRtl ? country.nameAr : country.name}
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
              >
                {parsed.options.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={option.value}
                      id={`${field.name}-${option.value}`}
                    />
                    <Label
                      htmlFor={`${field.name}-${option.value}`}
                      className="text-sm"
                    >
                      {getOptionLabel(option)}
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
              {parsed.other && otherSelected && (
                <OtherTextInput
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
            typeof max === "number" && max > 0 && parsed.showSelectionCounter !== false;
          const otherSelected = arr.includes(OTHER_VALUE);

          // Renders one option as a bordered card with a leading radio
          // dot. Selected/disabled visuals are themed off the event's
          // primaryColor (border + low-alpha tint + filled dot) so each
          // event keeps its own brand on this large, prominent control.
          const renderCard = (
            optionValue: string,
            labelText: string
          ) => {
            const selected = arr.includes(optionValue);
            const disabled = !selected && atLimit;
            const handleClick = () => {
              if (disabled) return;
              const next = selected
                ? arr.filter((v) => v !== optionValue)
                : [...arr, optionValue];
              handleFieldChange(field.name, next);
              // Deselecting Other clears the sibling text.
              if (selected && optionValue === OTHER_VALUE) {
                handleFieldChange(`${field.name}${OTHER_SUFFIX}`, "");
              }
            };
            const card = (
              <button
                type="button"
                key={optionValue}
                aria-pressed={selected}
                aria-disabled={disabled}
                onClick={handleClick}
                className={`flex h-full w-full items-start gap-3 rounded-[11px] border px-3.5 py-3 text-sm transition-colors ${
                  selected
                    ? "font-medium"
                    : disabled
                    ? "border-[#e3e4e8] text-gray-400 cursor-not-allowed opacity-60"
                    : "border-[#e3e4e8] text-gray-700 hover:border-gray-300 hover:bg-gray-50/60 cursor-pointer"
                }`}
                style={
                  selected
                    ? {
                        borderColor: primaryColor,
                        backgroundColor: `${primaryColor}1a`,
                        color: textColor,
                      }
                    : undefined
                }
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: selected ? primaryColor : "#d1d5db",
                  }}
                >
                  {selected && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                  )}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{labelText}</span>
              </button>
            );
            if (!disabled || typeof max !== "number") return card;
            return (
              <Tooltip key={optionValue}>
                <TooltipTrigger asChild>
                  {/* block h-full so the h-full card inside fills the
                      stretched grid cell — keeps at-max cards equal-height. */}
                  <span className="block h-full">{card}</span>
                </TooltipTrigger>
                <TooltipContent>{t.maxReachedTooltip(max)}</TooltipContent>
              </Tooltip>
            );
          };

          return (
            <TooltipProvider delayDuration={150}>
              <div
                className={`grid gap-2 ${
                  OPTION_COLS[field.optionColumns ?? "AUTO"]
                }`}
              >
                {parsed.options.map((option) =>
                  renderCard(option.value, getOptionLabel(option))
                )}
                {parsed.other &&
                  renderCard(
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

              {parsed.other && otherSelected && (
                <OtherTextInput
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
            className={INPUT_CLASSES}
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
            className={INPUT_CLASSES}
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
            className={INPUT_CLASSES}
          />
        )}

        {field.type === "FILE" && (
          <FileUploadControl
            eventSlug={eventSlug}
            formFieldId={field.id}
            metadata={parseFileFieldMetadata(field.metadata)}
            required={field.required}
            lang={lang}
            value={
              value && typeof value === "object" && !Array.isArray(value)
                ? (value as UploadedFileRef)
                : null
            }
            onChange={(next) => handleFieldChange(field.name, next)}
          />
        )}

        {/* Help text — rendered below the input for any non-layout field
            type. Suppressed when the field has no help text in the active
            language (so the wrapper doesn't leave an orphan gap). */}
        {getFieldHelpText(field) && (
          <p className="text-sm text-muted-foreground">
            {getFieldHelpText(field)}
          </p>
        )}
      </div>
    );
  }

  if (pageLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor }}
      >
        <div className="text-center">
          <Loader2
            className="h-8 w-8 animate-spin mx-auto mb-4"
            style={{ color: primaryColor }}
          />
          <p style={{ color: textColor }}>{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!eventData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor }}
      >
        <div className="text-center">
          <p className="text-red-500 text-lg">{error || t.eventNotFound}</p>
        </div>
      </div>
    );
  }

  const customStyles = branding?.customCss ? (
    <style dangerouslySetInnerHTML={{ __html: branding.customCss }} />
  ) : null;
  // Brand gradient used by the header accent line and the submit/next
  // buttons. Falls back to green→magenta when secondaryColor is unset.
  const submitGradient = `linear-gradient(90deg, ${primaryColor}, ${
    branding?.secondaryColor ?? "#CB1681"
  })`;
  // ── Header (Feature A) ──────────────────────────────────────────────
  // Resolved background; null → today's #0c0c0e strip (unchanged default).
  const headerColor = branding?.headerColor ?? "#0c0c0e";
  // Text color is auto-derived from the background, never stored. A light
  // header yields near-black text instead of the old hardcoded white.
  const headerTextColor = readableTextColor(headerColor);
  const headerIsDark = prefersWhiteText(headerColor);
  // Hard switch: headerShowLogo === false always shows the event-name text,
  // even when a logo is configured. Default (true / null) keeps the logo.
  const headerShowLogo = branding?.headerShowLogo !== false;
  // Dark/light-aware logo pick (A2): a dark header prefers the white-logo
  // variant, a light header prefers the normal logo; either falls back to
  // the other, then to event-name text when neither is set.
  const headerLogo = !headerShowLogo
    ? null
    : headerIsDark
    ? branding?.logoWhiteUrl ?? branding?.logoUrl ?? null
    : branding?.logoUrl ?? branding?.logoWhiteUrl ?? null;
  // Logo size is a MAX-height (small logos are never upscaled). null → 48px
  // (today's max-h-12). Defensively clamped 24–80 to mirror the API clamp.
  const headerLogoMaxHeight = Math.min(
    80,
    Math.max(24, branding?.logoHeight ?? 48)
  );

  const renderCardShell = (body: ReactNode) => (
    <>
      {customStyles}
      <div
        className="min-h-screen bg-[#fafafa] flex items-center justify-center py-8 px-4 sm:py-12"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="w-full max-w-[640px] bg-white rounded-2xl border border-gray-200/70 shadow-sm overflow-hidden">
          <div
            className="px-6 py-7 flex items-center justify-center"
            style={{ backgroundColor: headerColor }}
          >
            {headerLogo ? (
              <img
                src={headerLogo}
                alt={eventData.eventName}
                style={{ maxHeight: headerLogoMaxHeight }}
              />
            ) : (
              <span
                className="text-lg font-semibold"
                style={{ color: headerTextColor }}
              >
                {eventData.eventName}
              </span>
            )}
          </div>
          <div
            className="h-[3px] w-full"
            style={{ background: submitGradient }}
          />
          <div className="p-6 sm:p-8">{body}</div>
        </div>
      </div>
    </>
  );

  if (success) {
    return renderCardShell(
      <div className="text-center py-4">
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: `${primaryColor}20` }}
        >
          <CheckCircle
            className="h-10 w-10"
            style={{ color: primaryColor }}
          />
        </div>
        <h2
          className="mb-3 text-2xl font-bold"
          style={{ color: textColor }}
        >
          {t.successTitle}
        </h2>
        <p className="text-gray-500 text-base">{t.successMessage}</p>
      </div>
    );
  }

  return renderCardShell(
    <>
      <div className="flex items-center justify-end mb-3">
        <button
          type="button"
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors border border-gray-200 rounded-full px-3 py-1"
        >
          <Globe className="h-3 w-3" />
          {t.switchLang}
        </button>
      </div>

      <h1
        className="text-2xl font-bold text-center"
        style={{ color: textColor }}
      >
        {welcomeTitle}
      </h1>

      {/* Event-meta row. data-event-date/time/venue are load-bearing:
          existing per-event customCss (e.g. Productive Families) hides
          them via these exact attribute selectors. */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 text-xs text-gray-500">
        <span data-event-date className="flex items-center gap-1">
          <CalendarDays
            className="h-3.5 w-3.5"
            style={{ color: primaryColor }}
          />
          {formatDate(eventData.startDate)}
        </span>
        <span data-event-time className="flex items-center gap-1">
          <Clock
            className="h-3.5 w-3.5"
            style={{ color: primaryColor }}
          />
          {formatTime(eventData.startDate)}
        </span>
        {eventData.venue && (
          <span data-event-venue className="flex items-center gap-1">
            <MapPin
              className="h-3.5 w-3.5"
              style={{ color: primaryColor }}
            />
            {eventData.venue}
          </span>
        )}
      </div>

      {welcomeMessage && (
        <p className="text-sm text-center text-gray-500 mt-3 mb-6">
          {welcomeMessage}
        </p>
      )}

      {isMultiStep && (
        <div className="mb-6">
          <div className="flex items-center gap-2">
            {steps.map((step, idx) => {
              const isActive = idx === currentStep;
              const isComplete = idx < currentStep;
              return (
                <div
                  key={step.id}
                  className="flex-1 flex items-center gap-2"
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border transition-colors"
                    style={{
                      backgroundColor:
                        isActive || isComplete
                          ? primaryColor
                          : "transparent",
                      borderColor:
                        isActive || isComplete
                          ? primaryColor
                          : "#d1d5db",
                      color:
                        isActive || isComplete ? "#ffffff" : "#6b7280",
                    }}
                  >
                    {isComplete ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className="flex-1 h-px"
                      style={{
                        backgroundColor: isComplete
                          ? primaryColor
                          : "#e5e7eb",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {t.stepOf(currentStep + 1, totalSteps)} ·{" "}
            <span className="font-medium" style={{ color: textColor }}>
              {activeStep ? getStepTitle(activeStep) : ""}
            </span>
          </p>
          {activeStep && getStepDescription(activeStep) && (
            <p className="text-xs text-gray-500 mt-1">
              {getStepDescription(activeStep)}
            </p>
          )}
        </div>
      )}

      {draftRestored && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs flex items-center justify-between gap-2">
          <span className="text-gray-600">{t.draftRestored}</span>
          <button
            type="button"
            onClick={handleStartOver}
            className="text-gray-500 underline hover:text-gray-700"
          >
            {t.startOver}
          </button>
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
        className="space-y-5 registration-form"
      >
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {visibleFields.map((field) => renderField(field))}
        </div>

        {isMultiStep ? (
          <div className="flex items-center gap-3 pt-2">
            {!isFirstStep && (
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="h-[48px] rounded-[11px] flex-1 cursor-pointer"
              >
                {isRtl ? (
                  <ArrowRight className="h-4 w-4 mr-1" />
                ) : (
                  <ArrowLeft className="h-4 w-4 mr-1" />
                )}
                {t.back}
              </Button>
            )}
            {isLastStep ? (
              <Button
                type="button"
                onClick={performSubmit}
                className="h-[48px] rounded-[11px] text-base font-semibold shadow-sm cursor-pointer submit-button flex-1"
                style={{ background: submitGradient, color: "#fff" }}
                disabled={loading}
              >
                {loading ? t.registering : t.register}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={goNext}
                className="h-[48px] rounded-[11px] text-base font-semibold shadow-sm cursor-pointer flex-1"
                style={{ background: submitGradient, color: "#fff" }}
              >
                {t.next}
                {isRtl ? (
                  <ArrowLeft className="h-4 w-4 ml-1" />
                ) : (
                  <ArrowRight className="h-4 w-4 ml-1" />
                )}
              </Button>
            )}
          </div>
        ) : (
          <Button
            type="button"
            onClick={performSubmit}
            className="w-full h-[48px] rounded-[11px] text-base font-semibold shadow-sm cursor-pointer submit-button"
            style={{ background: submitGradient, color: "#fff" }}
            disabled={loading}
          >
            {loading ? t.registering : t.register}
          </Button>
        )}
      </form>

      {footerText && (
        <p className="text-center text-xs text-gray-400 mt-8">
          {footerText}
        </p>
      )}
    </>
  );
}
