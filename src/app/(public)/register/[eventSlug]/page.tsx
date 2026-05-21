"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  section?: string;
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

interface Branding {
  primaryColor: string;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  headerImageUrl?: string | null;
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

type FormValueMap = Record<string, string | boolean | string[]>;

interface DraftPayload {
  currentStep: number;
  formValues: FormValueMap;
  savedAt: string;
}

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
        className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
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
    counterBelow: (n: number, max: number) => `${n} of ${max} selected`,
    counterAtLimit: (max: number) => `Maximum reached — ${max} of ${max}`,
    maxReachedTooltip: (max: number) =>
      `Maximum ${max} selections reached. Uncheck one to choose a different option.`,
  },
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

  function handleFieldChange(name: string, value: string | boolean | string[]) {
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
        const empty =
          value === undefined ||
          value === null ||
          value === "" ||
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

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formValues),
    });

    const result = await res.json();

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
      setError(result.error || "Registration failed");
    }
    setLoading(false);
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
          <div key={field.id} className="col-span-2 pt-4">
            <h3 className="text-lg font-semibold" style={{ color: textColor }}>
              {label}
            </h3>
          </div>
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
            className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
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
            className="rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
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
                <SelectTrigger className="h-11 rounded-lg border-gray-200 bg-gray-50/50">
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
            <SelectTrigger className="h-11 rounded-lg border-gray-200 bg-gray-50/50">
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

          const renderPill = (
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
            const btn = (
              <button
                type="button"
                key={optionValue}
                aria-disabled={disabled}
                onClick={handleClick}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selected
                    ? "border-transparent text-white"
                    : disabled
                    ? "border-gray-200 bg-gray-50/50 text-gray-400 cursor-not-allowed opacity-60"
                    : "border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-100"
                }`}
                style={
                  selected ? { backgroundColor: primaryColor } : undefined
                }
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
                  renderPill(option.value, getOptionLabel(option))
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
            className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
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
            className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
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
            className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
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
  const headerImage = branding?.headerImageUrl || "/gathering-header.jpg";

  if (success) {
    return (
      <>
        {customStyles}
        <div
          className="min-h-screen lg:grid lg:grid-cols-2"
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div
            className="hidden lg:flex flex-col items-center justify-center p-12"
            style={{
              background: branding?.secondaryColor
                ? `linear-gradient(135deg, ${branding.secondaryColor} 0%, #2d2d2d 50%, ${branding.secondaryColor} 100%)`
                : "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)",
            }}
          >
            {branding?.logoUrl && (
              <img
                src={branding.logoUrl}
                alt={eventData.eventName}
                className="max-h-16 mb-8"
              />
            )}
            <img
              src={headerImage}
              alt={eventData.eventName}
              className="w-full max-w-md rounded-xl shadow-2xl"
            />
          </div>

          <div
            className="flex min-h-screen lg:min-h-0 items-center justify-center p-6 lg:p-12"
            style={{ backgroundColor }}
          >
            <div className="w-full max-w-md text-center">
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
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {customStyles}
      <div
        className="min-h-screen lg:grid lg:grid-cols-2"
        dir={isRtl ? "rtl" : "ltr"}
      >
        {/* Left branding panel */}
        <div
          className="hidden lg:flex flex-col items-center justify-center p-12 sticky top-0 h-screen"
          style={{
            background: branding?.secondaryColor
              ? `linear-gradient(135deg, ${branding.secondaryColor} 0%, #2d2d2d 50%, ${branding.secondaryColor} 100%)`
              : "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)",
          }}
        >
          {branding?.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={eventData.eventName}
              className="max-h-16 mb-8"
            />
          )}
          <img
            src={headerImage}
            alt={eventData.eventName}
            className="w-full max-w-lg rounded-xl shadow-2xl"
          />
          <div className="mt-10 text-center space-y-4">
            <div
              data-event-date
              className="flex items-center justify-center gap-3 text-gray-300"
            >
              <CalendarDays
                className="h-5 w-5"
                style={{ color: primaryColor }}
              />
              <span className="text-base">
                {formatDate(eventData.startDate)}
              </span>
            </div>
            <div
              data-event-time
              className="flex items-center justify-center gap-3 text-gray-300"
            >
              <Clock className="h-5 w-5" style={{ color: primaryColor }} />
              <span className="text-base">
                {formatTime(eventData.startDate)}
              </span>
            </div>
            {eventData.venue && (
              <div className="flex items-center justify-center gap-3 text-gray-300">
                <MapPin className="h-5 w-5" style={{ color: primaryColor }} />
                <span className="text-base">{eventData.venue}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex flex-col" style={{ backgroundColor }}>
          <div className="lg:hidden">
            <div
              style={{
                background: branding?.secondaryColor
                  ? `linear-gradient(135deg, ${branding.secondaryColor} 0%, #2d2d2d 50%, ${branding.secondaryColor} 100%)`
                  : "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)",
              }}
            >
              {branding?.logoUrl && (
                <div className="p-4 flex justify-center">
                  <img
                    src={branding.logoUrl}
                    alt={eventData.eventName}
                    className="max-h-12"
                  />
                </div>
              )}
              <img
                src={headerImage}
                alt={eventData.eventName}
                className="w-full h-auto block"
              />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
            <div className="w-full max-w-md">
              <div className="flex items-center justify-between mb-2">
                <h1
                  className="text-2xl lg:text-3xl font-bold"
                  style={{ color: textColor }}
                >
                  {welcomeTitle}
                </h1>
                <button
                  type="button"
                  onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors border border-gray-200 rounded-full px-3 py-1"
                >
                  <Globe className="h-3 w-3" />
                  {t.switchLang}
                </button>
              </div>
              <p className="text-sm text-gray-400 mb-6">{welcomeMessage}</p>

              <div className="lg:hidden flex flex-wrap gap-3 mb-6 text-xs text-gray-500">
                <span
                  data-event-date
                  className="flex items-center gap-1"
                >
                  <CalendarDays
                    className="h-3.5 w-3.5"
                    style={{ color: primaryColor }}
                  />
                  {formatDate(eventData.startDate)}
                </span>
                <span
                  data-event-time
                  className="flex items-center gap-1"
                >
                  <Clock
                    className="h-3.5 w-3.5"
                    style={{ color: primaryColor }}
                  />
                  {formatTime(eventData.startDate)}
                </span>
                {eventData.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin
                      className="h-3.5 w-3.5"
                      style={{ color: primaryColor }}
                    />
                    {eventData.venue}
                  </span>
                )}
              </div>

              {/* Stepper header — only when there's more than one step */}
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

              {/* Resumed-draft banner */}
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
                        className="h-12 rounded-lg flex-1 cursor-pointer"
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
                        className="h-12 rounded-lg text-base font-semibold shadow-sm cursor-pointer submit-button flex-1"
                        style={{
                          backgroundColor: primaryColor,
                          color: "#fff",
                        }}
                        disabled={loading}
                      >
                        {loading ? t.registering : t.register}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={goNext}
                        className="h-12 rounded-lg text-base font-semibold shadow-sm cursor-pointer flex-1"
                        style={{
                          backgroundColor: primaryColor,
                          color: "#fff",
                        }}
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
                    className="w-full h-12 rounded-lg text-base font-semibold shadow-sm cursor-pointer submit-button"
                    style={{ backgroundColor: primaryColor, color: "#fff" }}
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
