"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Globe, User, Mail, Phone, Building2, Briefcase, CalendarDays, MapPin, Clock } from "lucide-react";

interface PrefilledContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  designation: string | null;
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
    eventDate: "الثلاثاء ١٤ أبريل ٢٠٢٦",
    eventTime: "من الساعة ٦ مساءً",
    eventVenue: "منتجع ماسينا",
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
    eventDate: "Tuesday 14 April 2026",
    eventTime: "From 6 PM onwards",
    eventVenue: "Maseena Resort",
  },
};

export default function RegisterPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventSlug = params.eventSlug as string;
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [prefilled, setPrefilled] = useState<PrefilledContact | null>(null);
  const [eventName, setEventName] = useState("");
  const [lang, setLang] = useState<"ar" | "en">("ar");

  const t = translations[lang];
  const isRtl = lang === "ar";

  useEffect(() => {
    if (!token) return;
    fetch(`/api/register/${eventSlug}?token=${token}`)
      .then((r) => { if (r.ok) return r.json(); return null; })
      .then((data) => {
        if (data?.contact) setPrefilled(data.contact);
        if (data?.eventName) setEventName(data.eventName);
      })
      .catch(() => {});
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

  // Success screen
  if (success) {
    return (
      <div className="min-h-screen lg:grid lg:grid-cols-2" dir={isRtl ? "rtl" : "ltr"}>
        {/* Left branding panel - desktop only */}
        <div className="hidden lg:flex flex-col items-center justify-center p-12"
          style={{ background: "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)" }}>
          <img src="/gathering-header.jpg" alt={eventName || "Event"} className="w-full max-w-md rounded-xl shadow-2xl" />
          <div className="mt-8 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-gray-300">
              <CalendarDays className="h-4 w-4" />
              <span className="text-sm">{t.eventDate}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-gray-300">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{t.eventTime}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-gray-300">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{t.eventVenue}</span>
            </div>
          </div>
        </div>

        {/* Right panel / mobile full */}
        <div className="flex min-h-screen lg:min-h-0 items-center justify-center bg-white p-6 lg:p-12">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-gray-900">{t.successTitle}</h2>
            <p className="text-gray-500 text-base">{t.successMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  // Form
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2" dir={isRtl ? "rtl" : "ltr"}>
      {/* Left branding panel - desktop */}
      <div className="hidden lg:flex flex-col items-center justify-center p-12 sticky top-0 h-screen"
        style={{ background: "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)" }}>
        <img src="/gathering-header.jpg" alt={eventName || "Event"} className="w-full max-w-lg rounded-xl shadow-2xl" />
        <div className="mt-10 text-center space-y-4">
          <div className="flex items-center justify-center gap-3 text-gray-300">
            <CalendarDays className="h-5 w-5 text-[#6abf4b]" />
            <span className="text-base">{t.eventDate}</span>
          </div>
          <div className="flex items-center justify-center gap-3 text-gray-300">
            <Clock className="h-5 w-5 text-[#6abf4b]" />
            <span className="text-base">{t.eventTime}</span>
          </div>
          <div className="flex items-center justify-center gap-3 text-gray-300">
            <MapPin className="h-5 w-5 text-[#6abf4b]" />
            <span className="text-base">{t.eventVenue}</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-col bg-white">
        {/* Mobile banner */}
        <div className="lg:hidden">
          <div style={{ background: "linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 50%, #3a3a3a 100%)" }}>
            <img src="/gathering-header.jpg" alt={eventName || "Event"} className="w-full h-auto block" />
          </div>
        </div>

        {/* Form content */}
        <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {/* Language toggle + title */}
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{t.title}</h1>
              <button
                type="button"
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors border border-gray-200 rounded-full px-3 py-1"
              >
                <Globe className="h-3 w-3" />
                {t.switchLang}
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-8">{t.description}</p>

            {/* Mobile event details */}
            <div className="lg:hidden flex flex-wrap gap-3 mb-6 text-xs text-gray-500">
              <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-[#6abf4b]" />{t.eventDate}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-[#6abf4b]" />{t.eventTime}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#6abf4b]" />{t.eventVenue}</span>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
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
                    defaultValue={prefilled?.firstName || ""}
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
                    defaultValue={prefilled?.lastName || ""}
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
                  defaultValue={prefilled?.email || ""}
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
                  defaultValue={prefilled?.phone || ""}
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
                  defaultValue={prefilled?.organization || "LA GLOIRE"}
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
                  defaultValue={prefilled?.designation || ""}
                  required
                  className="h-11 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-12 rounded-lg text-base font-semibold shadow-sm cursor-pointer"
                style={{ backgroundColor: "#6abf4b", color: "#fff" }}
                disabled={loading}
              >
                {loading ? t.registering : t.register}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
