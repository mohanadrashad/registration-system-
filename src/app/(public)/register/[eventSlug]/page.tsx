"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { COUNTRIES } from "@/lib/form-builder/countries";

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
  formFields: FormField[];
  contact?: Record<string, string | null>;
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
  },
};

export default function RegisterPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventSlug = params.eventSlug as string;
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [formValues, setFormValues] = useState<Record<string, string | boolean | string[]>>({});

  const t = translations[lang];
  const isRtl = lang === "ar";
  const branding = eventData?.branding;

  const primaryColor = branding?.primaryColor || "#6abf4b";
  const backgroundColor = branding?.backgroundColor || "#ffffff";
  const textColor = branding?.textColor || "#000000";

  useEffect(() => {
    async function fetchEventData() {
      try {
        const url = token
          ? `/api/register/${eventSlug}?token=${token}`
          : `/api/register/${eventSlug}`;

        const res = await fetch(url);

        if (res.ok) {
          const data = await res.json();
          setEventData(data);

          // Initialize form values with defaults and contact data
          const initialValues: Record<string, string | boolean | string[]> = {};
          data.formFields?.forEach((field: FormField) => {
            if (data.contact && data.contact[field.name]) {
              initialValues[field.name] = data.contact[field.name];
            } else if (field.defaultValue) {
              initialValues[field.name] = field.defaultValue;
            } else if (field.type === "CHECKBOX") {
              initialValues[field.name] = false;
            } else if (field.type === "MULTISELECT") {
              initialValues[field.name] = [];
            } else {
              initialValues[field.name] = "";
            }
          });
          setFormValues(initialValues);
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
  }, [eventSlug, token]);

  function handleFieldChange(name: string, value: string | boolean | string[]) {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      setSuccess(true);
    } else {
      setError(result.error || "Registration failed");
    }
    setLoading(false);
  }

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
    return isRtl && field.placeholderAr ? field.placeholderAr : field.placeholder;
  }

  function getOptionLabel(option: { value: string; label: string; labelAr?: string }) {
    return isRtl && option.labelAr ? option.labelAr : option.label;
  }

  function renderField(field: FormField) {
    const label = getFieldLabel(field);
    const placeholder = getFieldPlaceholder(field);
    const value = formValues[field.name] || "";
    const widthClass = field.width === "HALF" ? "col-span-1" : field.width === "THIRD" ? "col-span-1" : "col-span-2";

    // Skip layout fields for now
    if (["HEADING", "DIVIDER", "PARAGRAPH"].includes(field.type)) {
      if (field.type === "HEADING") {
        return (
          <div key={field.id} className="col-span-2 pt-4">
            <h3 className="text-lg font-semibold" style={{ color: textColor }}>{label}</h3>
          </div>
        );
      }
      if (field.type === "DIVIDER") {
        return <hr key={field.id} className="col-span-2 my-4 border-gray-200" />;
      }
      if (field.type === "PARAGRAPH") {
        return (
          <p key={field.id} className="col-span-2 text-sm text-gray-500">{label}</p>
        );
      }
    }

    // Hidden field
    if (field.type === "HIDDEN") {
      return <input key={field.id} type="hidden" name={field.name} value={value as string} />;
    }

    return (
      <div key={field.id} className={`space-y-1.5 ${widthClass}`}>
        <Label htmlFor={field.name} className="text-xs font-medium text-gray-500">
          {label} {field.required && <span className="text-red-400">*</span>}
        </Label>

        {/* TEXT, EMAIL, PHONE, NUMBER */}
        {["TEXT", "EMAIL", "PHONE", "NUMBER", "PHONE_COUNTRY"].includes(field.type) && (
          <Input
            id={field.name}
            name={field.name}
            type={field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : "text"}
            value={value as string}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={placeholder}
            required={field.required}
            className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
          />
        )}

        {/* TEXTAREA */}
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

        {/* SELECT */}
        {field.type === "SELECT" && (
          <Select
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            required={field.required}
          >
            <SelectTrigger className="h-11 rounded-lg border-gray-200 bg-gray-50/50">
              <SelectValue placeholder={placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {getOptionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* COUNTRY */}
        {field.type === "COUNTRY" && (
          <Select
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            required={field.required}
          >
            <SelectTrigger className="h-11 rounded-lg border-gray-200 bg-gray-50/50">
              <SelectValue placeholder={placeholder || (isRtl ? "اختر الدولة..." : "Select country...")} />
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

        {/* RADIO */}
        {field.type === "RADIO" && (
          <RadioGroup
            value={value as string}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            className="flex flex-wrap gap-4"
          >
            {(field.options || []).map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`${field.name}-${option.value}`} />
                <Label htmlFor={`${field.name}-${option.value}`} className="text-sm">
                  {getOptionLabel(option)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {/* CHECKBOX */}
        {field.type === "CHECKBOX" && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value as boolean}
              onCheckedChange={(checked) => handleFieldChange(field.name, !!checked)}
            />
            <Label htmlFor={field.name} className="text-sm">
              {placeholder || label}
            </Label>
          </div>
        )}

        {/* DATE */}
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

        {/* TIME */}
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

        {/* DATETIME */}
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
      </div>
    );
  }

  // Loading state
  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor }}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: primaryColor }} />
          <p style={{ color: textColor }}>{t.loading}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (!eventData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor }}>
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

  // Success screen
  if (success) {
    return (
      <>
        {customStyles}
        <div className="min-h-screen lg:grid lg:grid-cols-2" dir={isRtl ? "rtl" : "ltr"}>
          <div
            className="hidden lg:flex flex-col items-center justify-center p-12"
            style={{
              background: branding?.secondaryColor
                ? `linear-gradient(135deg, ${branding.secondaryColor} 0%, #2d2d2d 50%, ${branding.secondaryColor} 100%)`
                : "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)",
            }}
          >
            {branding?.logoUrl && (
              <img src={branding.logoUrl} alt={eventData.eventName} className="max-h-16 mb-8" />
            )}
            <img src={headerImage} alt={eventData.eventName} className="w-full max-w-md rounded-xl shadow-2xl" />
          </div>

          <div className="flex min-h-screen lg:min-h-0 items-center justify-center p-6 lg:p-12" style={{ backgroundColor }}>
            <div className="w-full max-w-md text-center">
              <div
                className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <CheckCircle className="h-10 w-10" style={{ color: primaryColor }} />
              </div>
              <h2 className="mb-3 text-2xl font-bold" style={{ color: textColor }}>
                {t.successTitle}
              </h2>
              <p className="text-gray-500 text-base">{t.successMessage}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Form
  return (
    <>
      {customStyles}
      <div className="min-h-screen lg:grid lg:grid-cols-2" dir={isRtl ? "rtl" : "ltr"}>
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
            <img src={branding.logoUrl} alt={eventData.eventName} className="max-h-16 mb-8" />
          )}
          <img src={headerImage} alt={eventData.eventName} className="w-full max-w-lg rounded-xl shadow-2xl" />
          <div className="mt-10 text-center space-y-4">
            <div className="flex items-center justify-center gap-3 text-gray-300">
              <CalendarDays className="h-5 w-5" style={{ color: primaryColor }} />
              <span className="text-base">{formatDate(eventData.startDate)}</span>
            </div>
            <div className="flex items-center justify-center gap-3 text-gray-300">
              <Clock className="h-5 w-5" style={{ color: primaryColor }} />
              <span className="text-base">{formatTime(eventData.startDate)}</span>
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
          {/* Mobile banner */}
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
                  <img src={branding.logoUrl} alt={eventData.eventName} className="max-h-12" />
                </div>
              )}
              <img src={headerImage} alt={eventData.eventName} className="w-full h-auto block" />
            </div>
          </div>

          {/* Form content */}
          <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
            <div className="w-full max-w-md">
              {/* Language toggle + title */}
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: textColor }}>
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
              <p className="text-sm text-gray-400 mb-8">{welcomeMessage}</p>

              {/* Mobile event details */}
              <div className="lg:hidden flex flex-wrap gap-3 mb-6 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                  {formatDate(eventData.startDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                  {formatTime(eventData.startDate)}
                </span>
                {eventData.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                    {eventData.venue}
                  </span>
                )}
              </div>

              <form onSubmit={onSubmit} className="space-y-5 registration-form">
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {/* Dynamic form fields */}
                <div className="grid grid-cols-2 gap-4">
                  {eventData.formFields.map((field) => renderField(field))}
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-12 rounded-lg text-base font-semibold shadow-sm cursor-pointer submit-button"
                  style={{ backgroundColor: primaryColor, color: "#fff" }}
                  disabled={loading}
                >
                  {loading ? t.registering : t.register}
                </Button>
              </form>

              {/* Footer */}
              {footerText && (
                <p className="text-center text-xs text-gray-400 mt-8">{footerText}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
