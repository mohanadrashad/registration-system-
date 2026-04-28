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
  options: { value: string; label: string; labelAr?: string }[] | null;
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

function formatFieldValue(field: FormFieldDef, raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "-";
  if (Array.isArray(raw)) {
    return raw
      .map((v) => {
        const opt = field.options?.find((o) => o.value === v);
        return opt?.label ?? String(v);
      })
      .join(", ");
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (field.type === "COUNTRY") {
    const country = COUNTRIES.find((c) => c.code === raw);
    if (country) return country.name;
  }
  if (field.options && field.options.length > 0) {
    const opt = field.options.find((o) => o.value === raw);
    if (opt) return opt.label;
  }
  return String(raw);
}

export default function PortalPage() {
  const params = useParams();
  const eventSlug = params.eventSlug as string;

  // Login state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  // While we check whether the cookie is valid, hide the login form so it
  // doesn't flash for already-logged-in attendees. Starts true; flips to
  // false when the initial GET resolves (whether 200 or 401).
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
      setIsLoggedIn(true);
      return true;
    } catch {
      return false;
    }
  }, [eventSlug]);

  // On mount: check the cookie. If it works, show post-login; if not, show
  // login form. No URL params, no flash.
  useEffect(() => {
    if (sessionChecked.current) return;
    sessionChecked.current = true;
    loadPortalData().finally(() => setSessionChecking(false));
  }, [loadPortalData]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch(`/api/portal/${eventSlug}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed");
        return;
      }
      // Cookie is set by the response. Now load the portal data.
      const ok = await loadPortalData();
      if (!ok) {
        setLoginError(
          "Logged in but failed to load your registration. Please try again."
        );
      }
    } catch {
      setLoginError("Failed to connect. Please try again.");
    } finally {
      setLoggingIn(false);
    }
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
        setSaveError(data.error || "Failed to save changes");
      }
    } catch {
      setSaveError("Failed to connect. Please try again.");
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
    setCode("");
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
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
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
            <SelectValue placeholder="Select country..." />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name}
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
                {o.label}
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
            {field.label}
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
                  {o.label}
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
            Confirmed
          </Badge>
        );
      case "PENDING":
      case "PENDING_APPROVAL":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "WAITLISTED":
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            Waitlisted
          </Badge>
        );
      case "CANCELLED":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  // While we check the cookie session, hide the login form so it doesn't
  // flash for already-authenticated attendees.
  if (!isLoggedIn && sessionChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Login form
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Attendee Portal</CardTitle>
            <CardDescription>View and manage your registration</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                  {loginError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Confirmation Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter your confirmation code"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  You received this code in your registration confirmation email
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loggingIn}>
                {loggingIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Access Portal"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
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
    <div className="min-h-screen" style={{ backgroundColor }}>
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
              <p className="text-muted-foreground">Attendee Portal</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Log Out
          </Button>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Registration Status</CardTitle>
              {getStatusBadge(registration?.status || "")}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Event Date</p>
                  <p className="text-muted-foreground">
                    {event?.startDate && new Date(event.startDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {event?.venue && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Venue</p>
                    <p className="text-muted-foreground">{event.venue}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-1">Confirmation Code</p>
              <p className="font-mono text-lg font-semibold">{registration?.confirmationCode}</p>
            </div>

            {registration?.badgeGenerated && registration?.badgeUrl && (
              <div className="pt-4 border-t">
                <Button asChild className="w-full">
                  <a href={registration.badgeUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Download Badge
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
              <CardTitle>Your Details</CardTitle>
              {!editing && registration?.status !== "CANCELLED" && visibleFields.length > 0 && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {visibleFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No details to display.</p>
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
                        <Label className="text-xs text-muted-foreground">{field.label}</Label>
                        <p className="font-medium">{contact.email}</p>
                      </div>
                    );
                  }
                  return (
                    <div key={field.name} className="space-y-1.5">
                      {field.type !== "CHECKBOX" && (
                        <Label>
                          {field.label}
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
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : contact ? (
              <div className="space-y-3">
                {visibleFields.map((field) => (
                  <div key={field.name} className="flex items-start gap-3 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0">{field.label}</span>
                    <span className="font-medium break-words">
                      {formatFieldValue(field, getFieldValue(contact, field))}
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
              <CardTitle>Additional Information</CardTitle>
              <CardDescription>
                We need a few more details from you before the event. Each
                section opens on its own schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {phases.map((p) => {
                const opensAt = p.opensAt ? new Date(p.opensAt) : null;
                const closesAt = p.closesAt ? new Date(p.closesAt) : null;
                const baseHref = `/portal/${eventSlug}/phases/${p.id}`;

                let statusBadge: React.ReactNode = null;
                let action: React.ReactNode = null;
                let helperText: string | null = null;

                if (p.status === "OPEN") {
                  statusBadge = (
                    <Badge variant="default" className="text-xs">
                      Open
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
                        {p.isCompleted ? "Edit" : "Fill in"}
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  );
                  if (closesAt) {
                    helperText = `Closes ${closesAt.toLocaleString()}`;
                  }
                } else if (p.status === "NOT_OPEN") {
                  statusBadge = (
                    <Badge variant="secondary" className="text-xs">
                      <CalendarClock className="mr-1 h-3 w-3" />
                      Not open yet
                    </Badge>
                  );
                  if (opensAt) {
                    helperText = `Opens ${opensAt.toLocaleString()}`;
                  }
                } else if (p.status === "CLOSED") {
                  // Visible only when there's a submission (server already filtered).
                  statusBadge = (
                    <Badge variant="outline" className="text-xs">
                      Closed
                    </Badge>
                  );
                  action = (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={baseHref}>
                        View
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  );
                  helperText = "This phase is closed — view-only.";
                } else if (p.status === "LOCKED") {
                  statusBadge = (
                    <Badge variant="secondary" className="text-xs">
                      <LockIcon className="mr-1 h-3 w-3" />
                      Locked
                    </Badge>
                  );
                  helperText = "Not available for your registration.";
                }

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{p.title}</p>
                        {statusBadge}
                        {p.isCompleted && (
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle className="mr-1 h-3 w-3 text-green-600" />
                            Completed
                          </Badge>
                        )}
                        {p.isRequired && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            required
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {p.description}
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
              <CardTitle className="text-destructive">Cancel Registration</CardTitle>
              <CardDescription>
                If you can no longer attend, you can cancel your registration here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setCancelDialogOpen(true)}>
                Cancel My Registration
              </Button>
            </CardContent>
          </Card>
        )}

        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Cancel Registration
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel your registration for{" "}
                <strong>{event?.name}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                Keep Registration
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Yes, Cancel
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
