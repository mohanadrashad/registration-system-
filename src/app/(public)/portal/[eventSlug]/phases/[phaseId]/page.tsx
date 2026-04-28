"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  const email = searchParams.get("email") ?? "";
  const code = searchParams.get("code") ?? "";

  const [pageLoading, setPageLoading] = useState(true);
  const [phase, setPhase] = useState<PhaseData | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formValues, setFormValues] = useState<FormValueMap>({});
  const [currentStep, setCurrentStep] = useState(0);

  const totalSteps = phase?.steps.length ?? 0;
  const isMultiStep = totalSteps > 1;
  const activeStep = phase?.steps[currentStep] ?? null;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const readOnly = phase?.status === "CLOSED" || phase?.status === "LOCKED";

  useEffect(() => {
    async function fetchPhase() {
      if (!email || !code) {
        setError("Missing portal credentials. Please log in again.");
        setPageLoading(false);
        return;
      }
      try {
        const url = `/api/portal/${eventSlug}/phases/${phaseId}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load phase");
          setPageLoading(false);
          return;
        }
        const p: PhaseData = data.phase;
        const sub: SubmissionData | null = data.submission;
        setPhase(p);
        setSubmission(sub);

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
  }, [eventSlug, phaseId, email, code]);

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly) return;
    if (!validateCurrentStep()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/${eventSlug}/phases/${phaseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, data: formValues }),
      });
      const result = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(result.error || "Submission failed");
      }
    } catch {
      setError("Submission failed");
    } finally {
      setSubmitting(false);
    }
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

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Saved</h1>
            <p className="text-muted-foreground mt-1">
              Your response to &ldquo;{phase?.title}&rdquo; has been submitted.
              You can come back and edit it anytime until the phase closes.
            </p>
          </div>
          <Button asChild>
            <Link
              href={`/portal/${eventSlug}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`}
            >
              Back to portal
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!phase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-red-500">{error || "Phase not found"}</p>
          <Button asChild variant="outline">
            <Link href={`/portal/${eventSlug}`}>Back to portal</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link
            href={`/portal/${eventSlug}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`}
            className="text-sm text-muted-foreground inline-flex items-center hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to portal
          </Link>
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
            onSubmit={onSubmit}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                isMultiStep &&
                !isLastStep &&
                (e.target as HTMLElement).tagName !== "TEXTAREA"
              ) {
                e.preventDefault();
                goNext();
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
                      type="submit"
                      className="flex-1"
                      disabled={submitting}
                    >
                      {submitting ? "Saving…" : submission ? "Update" : "Submit"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={goNext}
                      className="flex-1"
                    >
                      Next <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              ) : (
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Saving…" : submission ? "Update" : "Submit"}
                </Button>
              )
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
