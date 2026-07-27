"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { isFieldVisible } from "@/lib/form-conditional";
import { prefersWhiteText, readableTextColor } from "@/lib/color-contrast";
import { OTHER_VALUE, OTHER_SUFFIX } from "@/lib/form-builder/options-parse";
import {
  DRAFT_TTL_MS,
  type DraftPayload,
  type EventData,
  type FormFieldValue,
  type FormStep,
  type FormValueMap,
} from "./classic-types";
import { translations } from "./classic-translations";
import { ClassicField } from "./classic-field";

// ── ClassicTemplate ──────────────────────────────────────────────────────
// The extracted, byte-for-byte current public registration renderer (the
// 2026-06 redesign), now the CLASSIC template in the Per-Event Template
// System. Self-contained: reads the eventSlug via useParams and owns its own
// data fetch + form state, exactly as the page did before extraction. Stage 1b
// will factor the shared field/stepper engine (renderField + the form body)
// out into a <RegistrationFormBody> that every template embeds; until then
// this stays a verbatim move so the byte-identical guarantee is trivial.
//
// MUST preserve the load-bearing customCss hooks (`data-event-date/time/venue`,
// `.registration-form`, `.submit-button`) — existing per-event customCss (e.g.
// Productive Families) targets them.
export function ClassicTemplate() {
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

        <div className="grid grid-cols-6 gap-4">
          {visibleFields.map((field) => (
            <ClassicField
              key={field.id}
              field={field}
              formValues={formValues}
              onFieldChange={handleFieldChange}
              lang={lang}
              t={t}
              eventSlug={eventSlug}
              primaryColor={primaryColor}
              textColor={textColor}
            />
          ))}
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
