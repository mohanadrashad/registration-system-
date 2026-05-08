"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  Clock,
  XCircle,
  Calendar,
  MapPin,
  Download,
  Edit,
  Loader2,
  LogOut,
  AlertTriangle,
  CalendarClock,
  Lock as LockIcon,
  ChevronRight,
} from "lucide-react";
import { COUNTRIES } from "@/lib/form-builder/countries";
import { localeTag, pickText, type PortalLang } from "@/lib/portal/i18n";

// ─── Bilingual UI strings (page-local). ───────────────────────────────
//
// Same pattern as the phase fill page's PAGE_STRINGS — kept inline rather
// than in a shared i18n module because the portal post-login flow has no
// translation infrastructure yet, the surface area is small, and a third
// language has never been on the table.
const PORTAL_STRINGS = {
  en: {
    languageToggle: "العربية",
    attendeePortal: "Attendee Portal",
    loginDescEmail: "Sign in to view and manage your registration.",
    loginDescCode: "Check your inbox — we just emailed a 6-digit code.",
    emailAddress: "Email address",
    emailHelp:
      "Use the email you registered with. We'll send a code to sign you in.",
    sendMeCode: "Send me a code",
    sendingCode: "Sending code…",
    sixDigitCode: "6-digit code",
    sentTo: (email: string) => `Sent to ${email}.`,
    useDifferentEmail: "Use a different email",
    verifyAndSignIn: "Verify and sign in",
    verifying: "Verifying…",
    resendIn: (s: number) => `Resend code in ${s}s`,
    sending: "Sending…",
    didntGetItResend: "Didn't get it? Resend code",
    couldntSendCode: "Couldn't send a code. Please try again.",
    couldntReachServer: "Couldn't reach the server. Please try again.",
    validEmail: "Please enter a valid email address.",
    enter6Digit: "Please enter the 6-digit code from your email.",
    codeFailed: "That code didn't work. Try again.",
    signedInButCouldntLoad:
      "Signed in but couldn't load your registration. Please refresh.",
    logout: "Log Out",
    registrationStatus: "Registration Status",
    eventDate: "Event Date",
    venue: "Venue",
    confirmationCode: "Confirmation Code",
    downloadBadge: "Download Badge",
    confirmed: "Confirmed",
    pending: "Pending",
    waitlisted: "Waitlisted",
    cancelled: "Cancelled",
    yourDetails: "Your Details",
    edit: "Edit",
    saveChanges: "Save Changes",
    cancel: "Cancel",
    noDetails: "No details to display.",
    failedToSave: "Failed to save changes",
    failedToConnect: "Failed to connect. Please try again.",
    additionalInfo: "Additional Information",
    additionalInfoDesc:
      "We need a few more details from you before the event. Each section opens on its own schedule.",
    open: "Open",
    notOpenYet: "Not open yet",
    closed: "Closed",
    locked: "Locked",
    completed: "Completed",
    required: "required",
    fillIn: "Fill in",
    view: "View",
    closes: (when: string) => `Closes ${when}`,
    opens: (when: string) => `Opens ${when}`,
    phaseClosedViewOnly: "This phase is closed — view-only.",
    notAvailable: "Not available for your registration.",
    cancelRegistration: "Cancel Registration",
    cancelRegistrationDesc:
      "If you can no longer attend, you can cancel your registration here.",
    cancelMyRegistration: "Cancel My Registration",
    cancelDialogQuestion: (eventName: string) =>
      `Are you sure you want to cancel your registration for ${eventName}? This action cannot be undone.`,
    keepRegistration: "Keep Registration",
    yesCancel: "Yes, Cancel",
    selectPlaceholder: "Select...",
    selectCountryPlaceholder: "Select country...",
    yes: "Yes",
    no: "No",
  },
  ar: {
    languageToggle: "English",
    attendeePortal: "بوابة الحضور",
    loginDescEmail: "سجّل الدخول لعرض تسجيلك وإدارته.",
    loginDescCode: "تحقق من بريدك — أرسلنا رمزًا من 6 أرقام للتو.",
    emailAddress: "البريد الإلكتروني",
    emailHelp:
      "استخدم البريد الذي سجّلت به. سنرسل رمزًا لتسجيل الدخول.",
    sendMeCode: "أرسل لي رمزًا",
    sendingCode: "جارٍ إرسال الرمز…",
    sixDigitCode: "الرمز المكوّن من 6 أرقام",
    sentTo: (email: string) => `أُرسل إلى ${email}.`,
    useDifferentEmail: "استخدام بريد آخر",
    verifyAndSignIn: "تحقق وسجّل الدخول",
    verifying: "جارٍ التحقق…",
    resendIn: (s: number) => `إعادة إرسال الرمز خلال ${s} ث`,
    sending: "جارٍ الإرسال…",
    didntGetItResend: "لم يصلك الرمز؟ إعادة إرسال",
    couldntSendCode: "تعذّر إرسال الرمز. يُرجى المحاولة مرة أخرى.",
    couldntReachServer: "تعذّر الوصول إلى الخادم. يُرجى المحاولة مرة أخرى.",
    validEmail: "يُرجى إدخال بريد إلكتروني صحيح.",
    enter6Digit: "يُرجى إدخال الرمز المكوّن من 6 أرقام من بريدك.",
    codeFailed: "لم يعمل الرمز. حاول مرة أخرى.",
    signedInButCouldntLoad:
      "تم تسجيل الدخول لكن تعذّر تحميل تسجيلك. يُرجى التحديث.",
    logout: "تسجيل الخروج",
    registrationStatus: "حالة التسجيل",
    eventDate: "تاريخ الفعالية",
    venue: "المكان",
    confirmationCode: "رمز التأكيد",
    downloadBadge: "تنزيل الشارة",
    confirmed: "مؤكد",
    pending: "قيد المراجعة",
    waitlisted: "في قائمة الانتظار",
    cancelled: "ملغى",
    yourDetails: "بياناتك",
    edit: "تعديل",
    saveChanges: "حفظ التعديلات",
    cancel: "إلغاء",
    noDetails: "لا توجد بيانات لعرضها.",
    failedToSave: "فشل حفظ التعديلات",
    failedToConnect: "فشل الاتصال. يُرجى المحاولة مرة أخرى.",
    additionalInfo: "معلومات إضافية",
    additionalInfoDesc:
      "نحتاج إلى بعض البيانات الإضافية قبل الفعالية. يفتح كل قسم وفق جدوله الخاص.",
    open: "مفتوح",
    notOpenYet: "لم يفتح بعد",
    closed: "مغلق",
    locked: "مقفل",
    completed: "مكتمل",
    required: "مطلوب",
    fillIn: "ابدأ",
    view: "عرض",
    closes: (when: string) => `يُغلق في ${when}`,
    opens: (when: string) => `يُفتح في ${when}`,
    phaseClosedViewOnly: "هذه المرحلة مغلقة — للعرض فقط.",
    notAvailable: "غير متاح لتسجيلك.",
    cancelRegistration: "إلغاء التسجيل",
    cancelRegistrationDesc:
      "إن لم تعد قادرًا على الحضور، يمكنك إلغاء تسجيلك من هنا.",
    cancelMyRegistration: "إلغاء تسجيلي",
    cancelDialogQuestion: (eventName: string) =>
      `هل أنت متأكد من إلغاء تسجيلك في "${eventName}"؟ لا يمكن التراجع عن هذا الإجراء.`,
    keepRegistration: "الإبقاء على التسجيل",
    yesCancel: "نعم، إلغاء",
    selectPlaceholder: "اختر...",
    selectCountryPlaceholder: "اختر الدولة...",
    yes: "نعم",
    no: "لا",
  },
} as const;

const COLUMN_FIELDS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
]);

const LAYOUT_TYPES = new Set(["HEADING", "DIVIDER", "PARAGRAPH", "HIDDEN"]);

interface FormFieldDef {
  name: string;
  label: string;
  labelAr: string | null;
  type: string;
  options: { value: string; label: string; labelAr?: string | null }[] | null;
  required: boolean;
  isSystem: boolean;
}

interface Branding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  customCss?: string | null;
}

interface EventInfo {
  name: string;
  description?: string;
  venue?: string;
  startDate: string;
  endDate: string;
  formFields: FormFieldDef[];
  branding?: Branding | null;
  multiLanguage?: boolean;
}

interface RegistrationInfo {
  id: string;
  status: string;
  confirmationCode: string;
  registeredAt?: string;
  badgeGenerated: boolean;
  badgeUrl?: string;
}

type PhaseStatus = "LOCKED" | "NOT_OPEN" | "OPEN" | "CLOSED";

interface PhaseInfo {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  order: number;
  opensAt?: string | null;
  closesAt?: string | null;
  isRequired: boolean;
  status: PhaseStatus;
  isCompleted: boolean;
  submittedAt?: string | null;
  updatedAt?: string | null;
}

interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  organization?: string | null;
  designation?: string | null;
  metadata?: Record<string, unknown> | null;
}

function getFieldValue(contact: ContactInfo, field: FormFieldDef): unknown {
  if (COLUMN_FIELDS.has(field.name)) {
    return (contact as unknown as Record<string, unknown>)[field.name];
  }
  return contact.metadata?.[field.name];
}

function formatFieldValue(
  field: FormFieldDef,
  raw: unknown,
  lang: PortalLang
): string {
  const t = PORTAL_STRINGS[lang];
  if (raw === undefined || raw === null || raw === "") return "-";
  if (Array.isArray(raw)) {
    return raw
      .map((v) => {
        const opt = field.options?.find((o) => o.value === v);
        if (!opt) return String(v);
        return pickText(lang, opt.label, opt.labelAr);
      })
      .join(", ");
  }
  if (typeof raw === "boolean") return raw ? t.yes : t.no;
  if (field.type === "COUNTRY") {
    const country = COUNTRIES.find((c) => c.code === raw);
    if (country) return lang === "ar" ? country.nameAr : country.name;
  }
  if (field.options && field.options.length > 0) {
    const opt = field.options.find((o) => o.value === raw);
    if (opt) return pickText(lang, opt.label, opt.labelAr);
  }
  return String(raw);
}

interface PortalEventInfo {
  name: string;
  multiLanguage?: boolean;
  branding?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    backgroundColor?: string | null;
    textColor?: string | null;
    logoUrl?: string | null;
    welcomeTitle?: string | null;
    welcomeTitleAr?: string | null;
    welcomeMessage?: string | null;
    welcomeMessageAr?: string | null;
    customCss?: string | null;
  } | null;
}

export default function PortalPage() {
  const params = useParams();
  const eventSlug = params.eventSlug as string;

  // ── Two-step OTP login state ───────────────────────────────────────
  const [loginStep, setLoginStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [eventInfo, setEventInfo] = useState<PortalEventInfo | null>(null);

  // Hide the login form during the initial cookie check so already-logged-in
  // attendees don't see it flash.
  const [sessionChecking, setSessionChecking] = useState(true);
  const sessionChecked = useRef(false);

  // Data state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [registration, setRegistration] = useState<RegistrationInfo | null>(null);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [phases, setPhases] = useState<PhaseInfo[]>([]);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Language preference. Same pattern as the phase fill page —
  // localStorage keyed per event so each event remembers its own choice.
  // Defaults to "en" until /info or /[eventSlug] tells us multiLanguage
  // is on, at which point we promote to "ar" (Saudi-market default,
  // matches the public registration page).
  const [lang, setLang] = useState<PortalLang>("en");
  const langStorageKey = `portal-lang:${eventSlug}`;
  const t = PORTAL_STRINGS[lang];
  const isRtl = lang === "ar";
  const tag = localeTag(lang);

  function toggleLang() {
    const next: PortalLang = lang === "ar" ? "en" : "ar";
    setLang(next);
    try {
      window.localStorage.setItem(langStorageKey, next);
    } catch {
      // localStorage unavailable; keep in-memory choice.
    }
  }

  // Apply a stored language preference (or the multiLanguage default)
  // once we know whether the event has multiLanguage on. Wrapped in
  // useCallback so it's stable across renders and can sit in
  // useEffect / useCallback dep arrays without re-firing.
  const hydrateLang = useCallback(
    (multiLanguageOn: boolean) => {
      try {
        const stored = window.localStorage.getItem(
          `portal-lang:${eventSlug}`
        );
        if (stored === "ar" || stored === "en") {
          setLang(stored);
          return;
        }
      } catch {
        // fall through to default
      }
      if (multiLanguageOn) setLang("ar");
    },
    [eventSlug]
  );

  // Bilingual field helpers — same shape as the phase fill page.
  function fieldLabel(f: FormFieldDef): string {
    return pickText(lang, f.label, f.labelAr);
  }
  function fieldOptionLabel(o: {
    label: string;
    labelAr?: string | null;
  }): string {
    return pickText(lang, o.label, o.labelAr);
  }

  function seedEditValues(contactData: ContactInfo, fields: FormFieldDef[]) {
    const values: Record<string, unknown> = {};
    for (const field of fields || []) {
      if (LAYOUT_TYPES.has(field.type)) continue;
      const raw = getFieldValue(contactData, field);
      if (field.type === "CHECKBOX") {
        values[field.name] = Boolean(raw);
      } else if (field.type === "MULTISELECT") {
        values[field.name] = Array.isArray(raw) ? raw : [];
      } else {
        values[field.name] = raw ?? "";
      }
    }
    setEditValues(values);
  }

  // Fetch the portal data using whatever session cookie the browser has.
  // Returns true on success, false on 401 (no/invalid session).
  const loadPortalData = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/portal/${eventSlug}`, {
        credentials: "same-origin",
      });
      if (res.status === 401) return false;
      if (!res.ok) return false;
      const data = await res.json();
      setEvent(data.event);
      setRegistration(data.registration);
      setContact(data.contact);
      setPhases(Array.isArray(data.phases) ? data.phases : []);
      seedEditValues(data.contact, data.event.formFields || []);
      hydrateLang(!!data.event?.multiLanguage);
      setIsLoggedIn(true);
      return true;
    } catch {
      return false;
    }
  }, [eventSlug, hydrateLang]);

  // On mount: check the cookie AND fetch event branding so the login form
  // can render in the event's colors before the user has typed anything.
  useEffect(() => {
    if (sessionChecked.current) return;
    sessionChecked.current = true;

    fetch(`/api/portal/${eventSlug}/info`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info) {
          setEventInfo(info);
          hydrateLang(!!info.multiLanguage);
        }
      })
      .catch(() => {});

    loadPortalData().finally(() => setSessionChecking(false));
  }, [loadPortalData, eventSlug, hydrateLang]);

  // Tick the resend cooldown every second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function requestOtp(opts?: { silent?: boolean }) {
    if (requestingOtp) return;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLoginError(t.validEmail);
      return;
    }
    setRequestingOtp(true);
    setLoginError("");
    try {
      const res = await fetch(`/api/portal/${eventSlug}/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || t.couldntSendCode);
        return;
      }
      setOtpCode("");
      setLoginStep("code");
      // 30-second cool-off before "Resend" lights up again.
      setResendCooldown(30);
      if (!opts?.silent) {
        // No toast lib here — we rely on the on-screen messaging.
      }
    } catch {
      setLoginError(t.couldntReachServer);
    } finally {
      setRequestingOtp(false);
    }
  }

  async function verifyOtp(submittedCode?: string) {
    const codeToCheck = (submittedCode ?? otpCode).trim();
    if (verifyingOtp) return;
    if (!/^\d{6}$/.test(codeToCheck)) {
      setLoginError(t.enter6Digit);
      return;
    }
    setVerifyingOtp(true);
    setLoginError("");
    try {
      const res = await fetch(`/api/portal/${eventSlug}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, code: codeToCheck }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || t.codeFailed);
        setOtpCode("");
        return;
      }
      const ok = await loadPortalData();
      if (!ok) {
        setLoginError(t.signedInButCouldntLoad);
      }
    } catch {
      setLoginError(t.couldntReachServer);
    } finally {
      setVerifyingOtp(false);
    }
  }

  function backToEmail() {
    setLoginStep("email");
    setOtpCode("");
    setLoginError("");
  }

  async function handleSave() {
    if (!event || !contact) return;
    setSaving(true);
    setSaveError("");

    try {
      const updates: Record<string, unknown> = {};
      for (const field of event.formFields || []) {
        if (LAYOUT_TYPES.has(field.type)) continue;
        if (field.name === "email") continue; // email is the login identifier; not editable here
        updates[field.name] = editValues[field.name];
      }

      const res = await fetch(`/api/portal/${eventSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ updates }),
      });

      const data = await res.json();

      if (res.ok) {
        // ── Reconcile local state from the inputs we just saved. ──
        const updatedContact: ContactInfo = { ...contact };
        const updatedMetadata: Record<string, unknown> = { ...(contact.metadata || {}) };
        for (const field of event.formFields || []) {
          if (LAYOUT_TYPES.has(field.type) || field.name === "email") continue;
          const v = editValues[field.name];
          if (COLUMN_FIELDS.has(field.name)) {
            (updatedContact as unknown as Record<string, unknown>)[field.name] = v;
          } else {
            updatedMetadata[field.name] = v;
          }
        }
        updatedContact.metadata = updatedMetadata;
        setContact(updatedContact);
        setEditing(false);
      } else {
        setSaveError(data.error || t.failedToSave);
      }
    } catch {
      setSaveError(t.failedToConnect);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);

    try {
      const res = await fetch(`/api/portal/${eventSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "cancel" }),
      });

      if (res.ok) {
        setRegistration({
          ...registration!,
          status: "CANCELLED",
        });
        setCancelDialogOpen(false);
      }
    } catch {
      // silently ignore; dialog stays open
    } finally {
      setCancelling(false);
    }
  }

  async function logout() {
    try {
      await fetch(`/api/portal/${eventSlug}/logout`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // best effort — even if the server call fails, clear local state
    }
    setIsLoggedIn(false);
    setEvent(null);
    setRegistration(null);
    setContact(null);
    setPhases([]);
    setEditValues({});
    setEditing(false);
    setEmail("");
    setOtpCode("");
    setLoginStep("email");
    setLoginError("");
  }

  function startEditing() {
    if (event && contact) {
      seedEditValues(contact, event.formFields || []);
    }
    setSaveError("");
    setEditing(true);
  }

  function renderEditInput(field: FormFieldDef) {
    const value = editValues[field.name];
    const setValue = (v: unknown) => setEditValues((prev) => ({ ...prev, [field.name]: v }));

    if (["TEXT", "EMAIL", "PHONE", "NUMBER", "PHONE_COUNTRY"].includes(field.type)) {
      return (
        <Input
          type={field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : "text"}
          value={(value as string) || ""}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    if (field.type === "TEXTAREA") {
      return (
        <Textarea
          value={(value as string) || ""}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
        />
      );
    }
    if (field.type === "SELECT") {
      return (
        <Select value={(value as string) || ""} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder={t.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {fieldOptionLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === "COUNTRY") {
      return (
        <Select value={(value as string) || ""} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder={t.selectCountryPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {lang === "ar" ? c.nameAr : c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === "RADIO") {
      return (
        <RadioGroup value={(value as string) || ""} onValueChange={setValue} className="flex flex-wrap gap-4">
          {(field.options || []).map((o) => (
            <div key={o.value} className="flex items-center space-x-2">
              <RadioGroupItem value={o.value} id={`${field.name}-${o.value}`} />
              <Label htmlFor={`${field.name}-${o.value}`} className="text-sm">
                {fieldOptionLabel(o)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    }
    if (field.type === "CHECKBOX") {
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={field.name}
            checked={Boolean(value)}
            onCheckedChange={(c) => setValue(Boolean(c))}
          />
          <Label htmlFor={field.name} className="text-sm">
            {fieldLabel(field)}
          </Label>
        </div>
      );
    }
    if (field.type === "MULTISELECT") {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1">
          {(field.options || []).map((o) => {
            const checked = arr.includes(o.value);
            return (
              <div key={o.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`${field.name}-${o.value}`}
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c ? [...arr, o.value] : arr.filter((v) => v !== o.value);
                    setValue(next);
                  }}
                />
                <Label htmlFor={`${field.name}-${o.value}`} className="text-sm">
                  {fieldOptionLabel(o)}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }
    if (["DATE", "TIME", "DATETIME"].includes(field.type)) {
      return (
        <Input
          type={field.type === "DATE" ? "date" : field.type === "TIME" ? "time" : "datetime-local"}
          value={(value as string) || ""}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    return (
      <Input
        value={(value as string) || ""}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "CONFIRMED":
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t.confirmed}
          </Badge>
        );
      case "PENDING":
      case "PENDING_APPROVAL":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            {t.pending}
          </Badge>
        );
      case "WAITLISTED":
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            {t.waitlisted}
          </Badge>
        );
      case "CANCELLED":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            {t.cancelled}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  // While we check the cookie session, hide the login form so it doesn't
  // flash for already-authenticated attendees.
  const loginBranding = eventInfo?.branding ?? null;
  const loginPrimary = loginBranding?.primaryColor || "#7dc242";
  const loginBackground = loginBranding?.backgroundColor || "#f9fafb";
  const loginTextColor = loginBranding?.textColor || "#111827";
  const loginLogo = loginBranding?.logoUrl || null;
  const loginCustomCss = loginBranding?.customCss ? (
    <style dangerouslySetInnerHTML={{ __html: loginBranding.customCss }} />
  ) : null;

  if (!isLoggedIn && sessionChecking) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: loginBackground }}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: loginPrimary }}
        />
      </div>
    );
  }

  // Login form — two-step OTP flow.
  if (!isLoggedIn) {
    return (
      <>
        {loginCustomCss}
        <div
          className="min-h-screen flex flex-col"
          style={{ backgroundColor: loginBackground }}
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="h-1.5 w-full" style={{ backgroundColor: loginPrimary }} />
          {/* Language toggle — top corner of the login screen, opposite */}
          {/* the upcoming RTL flip so it stays visible regardless of dir. */}
          {eventInfo?.multiLanguage && (
            <div className="flex justify-end p-3">
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
            </div>
          )}
          <div className="flex-1 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-sm">
              <CardHeader className="text-center space-y-3">
                {loginLogo && (
                  <div className="flex justify-center">
                    <img
                      src={loginLogo}
                      alt={eventInfo?.name ?? ""}
                      className="max-h-12"
                    />
                  </div>
                )}
                <CardTitle
                  className="text-2xl"
                  style={{ color: loginTextColor }}
                >
                  {eventInfo?.name ?? t.attendeePortal}
                </CardTitle>
                <CardDescription>
                  {loginStep === "email"
                    ? t.loginDescEmail
                    : t.loginDescCode}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loginError && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                    {loginError}
                  </div>
                )}

                {loginStep === "email" ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void requestOtp();
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email">{t.emailAddress}</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {t.emailHelp}
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11"
                      disabled={requestingOtp || !email}
                      style={{ backgroundColor: loginPrimary, color: "#fff" }}
                    >
                      {requestingOtp ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t.sendingCode}
                        </>
                      ) : (
                        t.sendMeCode
                      )}
                    </Button>
                  </form>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void verifyOtp();
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="otp">{t.sixDigitCode}</Label>
                      <Input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        maxLength={6}
                        pattern="[0-9]{6}"
                        value={otpCode}
                        onChange={(e) => {
                          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                          setOtpCode(next);
                          if (loginError) setLoginError("");
                          // Auto-submit when 6 digits arrive (paste or type).
                          if (next.length === 6) {
                            void verifyOtp(next);
                          }
                        }}
                        className="text-center text-2xl tracking-[0.4em] font-mono h-14"
                        placeholder="••••••"
                      />
                      <p className="text-xs text-muted-foreground text-center">
                        {t.sentTo(email)}{" "}
                        <button
                          type="button"
                          onClick={backToEmail}
                          className="underline hover:text-foreground"
                        >
                          {t.useDifferentEmail}
                        </button>
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11"
                      disabled={verifyingOtp || otpCode.length !== 6}
                      style={{ backgroundColor: loginPrimary, color: "#fff" }}
                    >
                      {verifyingOtp ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t.verifying}
                        </>
                      ) : (
                        t.verifyAndSignIn
                      )}
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => void requestOtp({ silent: true })}
                        disabled={resendCooldown > 0 || requestingOtp}
                        className="text-xs text-muted-foreground underline disabled:no-underline disabled:opacity-60"
                      >
                        {resendCooldown > 0
                          ? t.resendIn(resendCooldown)
                          : requestingOtp
                          ? t.sending
                          : t.didntGetItResend}
                      </button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  const visibleFields = (event?.formFields || []).filter((f) => !LAYOUT_TYPES.has(f.type));

  const branding = event?.branding ?? null;
  const primaryColor = branding?.primaryColor || "#7dc242";
  const backgroundColor = branding?.backgroundColor || "#ffffff";
  const textColor = branding?.textColor || "#111827";
  const logoUrl = branding?.logoUrl || null;
  const customStyles = branding?.customCss ? (
    <style dangerouslySetInnerHTML={{ __html: branding.customCss }} />
  ) : null;

  return (
    <>
      {customStyles}
    <div
      className="min-h-screen"
      style={{ backgroundColor }}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Primary-color accent band at the top of the page so the brand is
          immediately visible even before scrolling to action buttons. */}
      <div className="h-1.5 w-full" style={{ backgroundColor: primaryColor }} />
      <div className="py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={event?.name ?? ""}
                className="max-h-10"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold" style={{ color: textColor }}>
                {event?.name}
              </h1>
              <p className="text-muted-foreground">{t.attendeePortal}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              {t.logout}
            </Button>
          </div>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t.registrationStatus}</CardTitle>
              {getStatusBadge(registration?.status || "")}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{t.eventDate}</p>
                  <p className="text-muted-foreground">
                    {event?.startDate &&
                      new Date(event.startDate).toLocaleDateString(tag)}
                  </p>
                </div>
              </div>
              {event?.venue && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t.venue}</p>
                    <p className="text-muted-foreground">{event.venue}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-1">
                {t.confirmationCode}
              </p>
              {/* Confirmation code is alphanumeric / kept in monospace LTR
                  even in RTL — it's a machine identifier, not Arabic text. */}
              <p
                className="font-mono text-lg font-semibold"
                dir="ltr"
                style={{ unicodeBidi: "isolate" }}
              >
                {registration?.confirmationCode}
              </p>
            </div>

            {registration?.badgeGenerated && registration?.badgeUrl && (
              <div className="pt-4 border-t">
                <Button asChild className="w-full">
                  <a href={registration.badgeUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    {t.downloadBadge}
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Your Details — driven by the event's form fields */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t.yourDetails}</CardTitle>
              {!editing && registration?.status !== "CANCELLED" && visibleFields.length > 0 && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Edit className="h-4 w-4 mr-2" />
                  {t.edit}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {visibleFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noDetails}</p>
            ) : editing && contact ? (
              <div className="space-y-4">
                {saveError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                    {saveError}
                  </div>
                )}
                {visibleFields.map((field) => {
                  if (field.name === "email") {
                    return (
                      <div key={field.name}>
                        <Label className="text-xs text-muted-foreground">{fieldLabel(field)}</Label>
                        <p className="font-medium">{contact.email}</p>
                      </div>
                    );
                  }
                  return (
                    <div key={field.name} className="space-y-1.5">
                      {field.type !== "CHECKBOX" && (
                        <Label>
                          {fieldLabel(field)}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                      )}
                      {renderEditInput(field)}
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t.saveChanges}
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    {t.cancel}
                  </Button>
                </div>
              </div>
            ) : contact ? (
              <div className="space-y-3">
                {visibleFields.map((field) => (
                  <div key={field.name} className="flex items-start gap-3 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0">
                      {fieldLabel(field)}
                    </span>
                    <span className="font-medium break-words">
                      {formatFieldValue(field, getFieldValue(contact, field), lang)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Additional information phases (post-registration) */}
        {phases.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t.additionalInfo}</CardTitle>
              <CardDescription>{t.additionalInfoDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {phases.map((p) => {
                const opensAt = p.opensAt ? new Date(p.opensAt) : null;
                const closesAt = p.closesAt ? new Date(p.closesAt) : null;
                const baseHref = `/portal/${eventSlug}/phases/${p.id}`;
                const phaseTitle = pickText(lang, p.title, p.titleAr);
                const phaseDescription = pickText(
                  lang,
                  p.description,
                  p.descriptionAr
                );

                let statusBadge: React.ReactNode = null;
                let action: React.ReactNode = null;
                let helperText: string | null = null;

                if (p.status === "OPEN") {
                  statusBadge = (
                    <Badge variant="default" className="text-xs">
                      {t.open}
                    </Badge>
                  );
                  action = (
                    <Button
                      asChild
                      variant={p.isCompleted ? "outline" : "default"}
                      size="sm"
                      style={
                        p.isCompleted
                          ? undefined
                          : { backgroundColor: primaryColor, color: "#fff" }
                      }
                    >
                      <Link href={baseHref}>
                        {p.isCompleted ? t.edit : t.fillIn}
                        <ChevronRight
                          className={`h-3.5 w-3.5 ${
                            isRtl ? "mr-1 rotate-180" : "ml-1"
                          }`}
                        />
                      </Link>
                    </Button>
                  );
                  if (closesAt) {
                    helperText = t.closes(closesAt.toLocaleString(tag));
                  }
                } else if (p.status === "NOT_OPEN") {
                  statusBadge = (
                    <Badge variant="secondary" className="text-xs">
                      <CalendarClock className="mr-1 h-3 w-3" />
                      {t.notOpenYet}
                    </Badge>
                  );
                  if (opensAt) {
                    helperText = t.opens(opensAt.toLocaleString(tag));
                  }
                } else if (p.status === "CLOSED") {
                  // Visible only when there's a submission (server already filtered).
                  statusBadge = (
                    <Badge variant="outline" className="text-xs">
                      {t.closed}
                    </Badge>
                  );
                  action = (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={baseHref}>
                        {t.view}
                        <ChevronRight
                          className={`h-3.5 w-3.5 ${
                            isRtl ? "mr-1 rotate-180" : "ml-1"
                          }`}
                        />
                      </Link>
                    </Button>
                  );
                  helperText = t.phaseClosedViewOnly;
                } else if (p.status === "LOCKED") {
                  statusBadge = (
                    <Badge variant="secondary" className="text-xs">
                      <LockIcon className="mr-1 h-3 w-3" />
                      {t.locked}
                    </Badge>
                  );
                  helperText = t.notAvailable;
                }

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{phaseTitle}</p>
                        {statusBadge}
                        {p.isCompleted && (
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle className="mr-1 h-3 w-3 text-green-600" />
                            {t.completed}
                          </Badge>
                        )}
                        {p.isRequired && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.required}
                          </span>
                        )}
                      </div>
                      {phaseDescription && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {phaseDescription}
                        </p>
                      )}
                      {helperText && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {helperText}
                        </p>
                      )}
                    </div>
                    {action}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Cancel Registration */}
        {registration?.status !== "CANCELLED" && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">
                {t.cancelRegistration}
              </CardTitle>
              <CardDescription>{t.cancelRegistrationDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setCancelDialogOpen(true)}>
                {t.cancelMyRegistration}
              </Button>
            </CardContent>
          </Card>
        )}

        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent dir={isRtl ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                {t.cancelRegistration}
              </DialogTitle>
              <DialogDescription>
                {t.cancelDialogQuestion(event?.name ?? "")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                {t.keepRegistration}
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.yesCancel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </div>
    </div>
    </>
  );
}
