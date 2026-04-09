"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

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
    register: "تسجيل",
    registering: "جاري التسجيل...",
    successTitle: "تم التسجيل بنجاح!",
    successMessage: "شكراً لتسجيلك. نتطلع لرؤيتك هناك!",
    switchLang: "English",
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
    register: "Register",
    registering: "Registering...",
    successTitle: "Registration Successful!",
    successMessage: "Thank you for registering. We look forward to seeing you there!",
    switchLang: "العربية",
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
  const [lang, setLang] = useState<"ar" | "en">("ar");

  const t = translations[lang];
  const isRtl = lang === "ar";

  // If token is present, fetch the invited contact's data to pre-fill the form
  useEffect(() => {
    if (!token) return;
    fetch(`/api/register/${eventSlug}?token=${token}`)
      .then((r) => { if (r.ok) return r.json(); return null; })
      .then((data) => { if (data?.contact) setPrefilled(data.contact); })
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

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4" dir={isRtl ? "rtl" : "ltr"}>
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
            <h2 className="mb-2 text-2xl font-bold">{t.successTitle}</h2>
            <p className="text-muted-foreground">{t.successMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
            >
              {t.switchLang}
            </button>
          </div>
          <CardTitle className="text-2xl">{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t.firstName} <span className="text-destructive">*</span></Label>
                <Input id="firstName" name="firstName" defaultValue={prefilled?.firstName || ""} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t.lastName} <span className="text-destructive">*</span></Label>
                <Input id="lastName" name="lastName" defaultValue={prefilled?.lastName || ""} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t.email} <span className="text-destructive">*</span></Label>
              <Input id="email" name="email" type="email" defaultValue={prefilled?.email || ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t.phone} <span className="text-destructive">*</span></Label>
              <Input id="phone" name="phone" defaultValue={prefilled?.phone || ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization">{t.organization} <span className="text-destructive">*</span></Label>
              <Input id="organization" name="organization" defaultValue={prefilled?.organization || ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designation">{t.designation} <span className="text-destructive">*</span></Label>
              <Input id="designation" name="designation" defaultValue={prefilled?.designation || ""} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t.registering : t.register}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
