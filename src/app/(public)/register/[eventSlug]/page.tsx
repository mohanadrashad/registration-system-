"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Globe, User, Mail, Phone, Building2, Briefcase, CalendarDays, MapPin, Clock, Loader2 } from "lucide-react";

interface PrefilledContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  designation: string | null;
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
  contact?: PrefilledContact;
}

const translations = {
  ar: {
    title: "تسجيل الحضور",
    description: "يرجى تعبئة بياناتك للتسجيل",
    firstName: "الاسم الأول",
    lastName: "اسم العائلة",
    email: "البريد الإلكتروني",
    phone: "رقم الهاتف",
    organization: "جهة العمل",
    designation: "المسمى الوظيفي",
    register: "تأكيد التسجيل",
    registering: "جاري التسجيل...",
    successTitle: "تم التسجيل بنجاح!",
    successMessage: "شكراً لتسجيلك. نتطلع لرؤيتك هناك!",
    switchLang: "English",
    loading: "جاري التحميل...",
    eventNotFound: "الفعالية غير موجودة",
  },
  en: {
    title: "Event Registration",
    description: "Fill in your details to register",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone",
    organization: "Organization",
    designation: "Designation / Title",
    register: "Confirm Registration",
    registering: "Registering...",
    successTitle: "Registration Successful!",
    successMessage: "Thank you for registering. We look forward to seeing you there!",
    switchLang: "العربية",
    loading: "Loading...",
    eventNotFound: "Event not found",
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

  const t = translations[lang];
  const isRtl = lang === "ar";
  const branding = eventData?.branding;

  // Default colors
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      organization: formData.get("organization"),
      designation: formData.get("designation"),
    };

    const url = token
      ? `/api/register/${eventSlug}?token=${token}`
      : `/api/register/${eventSlug}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.ok) {
      setSuccess(true);
    } else {
      setError(result.error || "Registration failed");
    }
    setLoading(false);
  }

  // Get welcome content based on language
  const welcomeTitle = isRtl
    ? (branding?.welcomeTitleAr || branding?.welcomeTitle || t.title)
    : (branding?.welcomeTitle || t.title);

  const welcomeMessage = isRtl
    ? (branding?.welcomeMessageAr || branding?.welcomeMessage || t.description)
    : (branding?.welcomeMessage || t.description);

  const footerText = isRtl
    ? (branding?.footerTextAr || branding?.footerText)
    : (branding?.footerText || branding?.footerTextAr);

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return date.toLocaleDateString(isRtl ? "ar-SA" : "en-US", options);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(isRtl ? "ar-SA" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

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

  // Custom CSS
  const customStyles = branding?.customCss ? (
    <style dangerouslySetInnerHTML={{ __html: branding.customCss }} />
  ) : null;

  // Header image
  const headerImage = branding?.headerImageUrl || "/gathering-header.jpg";

  // Success screen
  if (success) {
    return (
      <>
        {customStyles}
        <div className="min-h-screen lg:grid lg:grid-cols-2" dir={isRtl ? "rtl" : "ltr"}>
          {/* Left branding panel - desktop only */}
          <div
            className="hidden lg:flex flex-col items-center justify-center p-12"
            style={{
              background: branding?.secondaryColor
                ? `linear-gradient(135deg, ${branding.secondaryColor} 0%, #2d2d2d 50%, ${branding.secondaryColor} 100%)`
                : "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)",
            }}
          >
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt={eventData.eventName} className="max-h-16 mb-8" />
            ) : null}
            <img src={headerImage} alt={eventData.eventName} className="w-full max-w-md rounded-xl shadow-2xl" />
            <div className="mt-8 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-gray-300">
                <CalendarDays className="h-4 w-4" />
                <span className="text-sm">{formatDate(eventData.startDate)}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-gray-300">
                <Clock className="h-4 w-4" />
                <span className="text-sm">{formatTime(eventData.startDate)}</span>
              </div>
              {eventData.venue && (
                <div className="flex items-center justify-center gap-2 text-gray-300">
                  <MapPin className="h-4 w-4" />
                  <span className="text-sm">{eventData.venue}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right panel / mobile full */}
          <div
            className="flex min-h-screen lg:min-h-0 items-center justify-center p-6 lg:p-12"
            style={{ backgroundColor }}
          >
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
        {/* Left branding panel - desktop */}
        <div
          className="hidden lg:flex flex-col items-center justify-center p-12 sticky top-0 h-screen"
          style={{
            background: branding?.secondaryColor
              ? `linear-gradient(135deg, ${branding.secondaryColor} 0%, #2d2d2d 50%, ${branding.secondaryColor} 100%)`
              : "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)",
          }}
        >
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt={eventData.eventName} className="max-h-16 mb-8" />
          ) : null}
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

                {/* Name row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <User className="h-3 w-3" />
                      {t.firstName} <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      defaultValue={eventData.contact?.firstName || ""}
                      required
                      className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <User className="h-3 w-3" />
                      {t.lastName} <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      defaultValue={eventData.contact?.lastName || ""}
                      required
                      className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Mail className="h-3 w-3" />
                    {t.email} <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={eventData.contact?.email || ""}
                    required
                    className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Phone className="h-3 w-3" />
                    {t.phone} <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={eventData.contact?.phone || ""}
                    required
                    className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                  />
                </div>

                {/* Organization */}
                <div className="space-y-1.5">
                  <Label htmlFor="organization" className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" />
                    {t.organization} <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="organization"
                    name="organization"
                    defaultValue={eventData.contact?.organization || "LA GLOIRE"}
                    required
                    className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                  />
                </div>

                {/* Designation */}
                <div className="space-y-1.5">
                  <Label htmlFor="designation" className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Briefcase className="h-3 w-3" />
                    {t.designation} <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="designation"
                    name="designation"
                    defaultValue={eventData.contact?.designation || ""}
                    required
                    className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                  />
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
