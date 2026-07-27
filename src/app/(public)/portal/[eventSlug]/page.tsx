"use client";

// Attendee portal home — container page. Owns the session check, portal
// data, language preference, and edit/cancel state; the UI is composed
// from the colocated pieces in this folder (login screen + the four
// cards). Bilingual strings live in portal-strings.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import { localeTag, type PortalLang } from "@/lib/portal/i18n";
import { OTHER_SUFFIX } from "@/lib/form-builder/options-parse";

import {
  COLUMN_FIELDS,
  LAYOUT_TYPES,
  getFieldValue,
  type ContactInfo,
  type EventInfo,
  type FormFieldDef,
  type PhaseInfo,
  type PortalEventInfo,
  type RegistrationInfo,
} from "./types";
import { PORTAL_STRINGS } from "./portal-strings";
import { LoginScreen } from "./login-screen";
import { StatusCard } from "./status-card";
import { DetailsCard } from "./details-card";
import { PhasesCard } from "./phases-card";
import { CancelCard } from "./cancel-card";

export default function PortalPage() {
  const params = useParams();
  const eventSlug = params.eventSlug as string;

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

  function seedEditValues(contactData: ContactInfo, fields: FormFieldDef[]) {
    const values: Record<string, unknown> = {};
    const metadata = (contactData as { metadata?: Record<string, unknown> })
      .metadata;
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
      // Seed sibling _other text so editing an Other-selected field
      // doesn't drop the custom text the visitor previously typed.
      const sibling = metadata?.[`${field.name}${OTHER_SUFFIX}`];
      if (typeof sibling === "string") {
        values[`${field.name}${OTHER_SUFFIX}`] = sibling;
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
    // The OTP form state (email, code, step, error) lives in LoginScreen,
    // which remounts fresh once isLoggedIn flips back to false.
  }

  function startEditing() {
    if (event && contact) {
      seedEditValues(contact, event.formFields || []);
    }
    setSaveError("");
    setEditing(true);
  }

  // While we check the cookie session, hide the login form so it doesn't
  // flash for already-authenticated attendees.
  if (!isLoggedIn && sessionChecking) {
    const loginBranding = eventInfo?.branding ?? null;
    const loginPrimary = loginBranding?.primaryColor || "#7dc242";
    const loginBackground = loginBranding?.backgroundColor || "#f9fafb";
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
      <LoginScreen
        eventSlug={eventSlug}
        eventInfo={eventInfo}
        lang={lang}
        t={t}
        isRtl={isRtl}
        onToggleLang={toggleLang}
        onLoggedIn={loadPortalData}
      />
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

        <StatusCard registration={registration} event={event} t={t} tag={tag} />

        <DetailsCard
          visibleFields={visibleFields}
          contact={contact}
          registrationStatus={registration?.status}
          lang={lang}
          t={t}
          editing={editing}
          editValues={editValues}
          setEditValues={setEditValues}
          saving={saving}
          saveError={saveError}
          onStartEditing={startEditing}
          onSave={handleSave}
          onCancelEditing={() => setEditing(false)}
        />

        <PhasesCard
          phases={phases}
          eventSlug={eventSlug}
          lang={lang}
          t={t}
          tag={tag}
          isRtl={isRtl}
          primaryColor={primaryColor}
        />

        <CancelCard
          registrationStatus={registration?.status}
          eventName={event?.name ?? ""}
          t={t}
          isRtl={isRtl}
          dialogOpen={cancelDialogOpen}
          onDialogOpenChange={setCancelDialogOpen}
          cancelling={cancelling}
          onConfirmCancel={handleCancel}
        />
      </div>
      </div>
    </div>
    </>
  );
}
