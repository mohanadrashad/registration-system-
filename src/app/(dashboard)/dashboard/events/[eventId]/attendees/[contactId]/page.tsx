"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getRole, canEdit } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Copy,
  Check,
  Mail,
  Clock,
  ExternalLink,
  Award,
  Tag,
  User,
  Lock,
  Unlock,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COUNTRIES } from "@/lib/form-builder/countries";

type ContactStatus = "IMPORTED" | "INVITED" | "REGISTERED" | "CANCELLED";

// Field names that are stored as Contact columns by the register handler's destructure.
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
  isSystem: boolean;
}

interface ContactDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  designation: string | null;
  category: string | null;
  status: ContactStatus;
  inviteToken: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  registration: { status: string; registeredAt: string; confirmationCode: string; badgeEmailSent: boolean } | null;
  emailLogs: { id: string; status: string; sentAt: string | null; subject: string }[];
  event: { slug: string; name: string; categories: string[] };
  formFields: FormFieldDef[];
}

const statusConfig: Record<ContactStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  IMPORTED: { label: "Imported", variant: "secondary" },
  INVITED: { label: "Invited", variant: "outline" },
  REGISTERED: { label: "Registered", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

type PhaseStatus = "LOCKED" | "NOT_OPEN" | "OPEN" | "CLOSED";
type AccessOverride = "OPEN" | "LOCKED" | null;

interface PhaseAccessItem {
  id: string;
  title: string;
  titleAr: string | null;
  opensAt: string | null;
  closesAt: string | null;
  isRequired: boolean;
  override: AccessOverride;
  reason: string | null;
  overriddenAt: string | null;
  status: PhaseStatus;
}

const phaseStatusConfig: Record<
  PhaseStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  OPEN: { label: "Open", variant: "default" },
  NOT_OPEN: { label: "Not open yet", variant: "secondary" },
  CLOSED: { label: "Closed", variant: "outline" },
  LOCKED: { label: "Locked", variant: "destructive" },
};

function getFieldValue(contact: ContactDetail, field: FormFieldDef): unknown {
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

function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@noemail.local");
}

function deriveDisplayName(contact: ContactDetail, visibleFields: FormFieldDef[]): { primary: string; secondary: string } {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const secondary = contact.email && !isSyntheticEmail(contact.email) ? contact.email : "";

  if (fullName) {
    return { primary: fullName, secondary };
  }

  const textFields = visibleFields.filter((f) => ["TEXT", "EMAIL", "PHONE"].includes(f.type));
  const values: string[] = [];
  for (const f of textFields) {
    const v = getFieldValue(contact, f);
    if (typeof v === "string" && v.trim() !== "") {
      values.push(v.trim());
      if (values.length === 2) break;
    }
  }
  if (values.length > 0) {
    return { primary: values.join(" "), secondary };
  }
  return {
    primary: "Attendee",
    secondary: contact.registration?.confirmationCode || "",
  };
}

export default function AttendeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const contactId = params.contactId as string;
  const { data: session } = useSession();
  const userCanEdit = canEdit(getRole(session as { user?: { role?: string } } | null));

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [editCategory, setEditCategory] = useState("");
  const [editStatus, setEditStatus] = useState<ContactStatus>("IMPORTED");

  const [phaseAccess, setPhaseAccess] = useState<PhaseAccessItem[] | null>(null);
  const [phaseAccessDialog, setPhaseAccessDialog] = useState<{
    phaseId: string;
    phaseTitle: string;
    nextStatus: "OPEN" | "LOCKED";
    reason: string;
  } | null>(null);
  const [phaseAccessSaving, setPhaseAccessSaving] = useState(false);

  const fetchContact = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`);
      if (!res.ok) throw new Error("Not found");
      const data: ContactDetail = await res.json();
      setContact(data);

      const values: Record<string, unknown> = {};
      for (const field of data.formFields || []) {
        if (LAYOUT_TYPES.has(field.type)) continue;
        const raw = getFieldValue(data, field);
        if (field.type === "CHECKBOX") {
          values[field.name] = Boolean(raw);
        } else if (field.type === "MULTISELECT") {
          values[field.name] = Array.isArray(raw) ? raw : [];
        } else {
          values[field.name] = raw ?? "";
        }
      }
      setEditValues(values);
      setEditCategory(data.category || "");
      setEditStatus(data.status);
    } catch {
      toast.error("Failed to load attendee");
      router.push(`/dashboard/events/${eventId}/attendees`);
    } finally {
      setLoading(false);
    }
  }, [eventId, contactId, router]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const fetchPhaseAccess = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/phase-access`
      );
      if (!res.ok) return;
      const data: { phases: PhaseAccessItem[] } = await res.json();
      setPhaseAccess(data.phases);
    } catch {
      // Non-fatal — the card just won't render.
    }
  }, [eventId, contactId]);

  useEffect(() => {
    fetchPhaseAccess();
  }, [fetchPhaseAccess]);

  async function submitPhaseAccess(
    phaseId: string,
    status: "OPEN" | "LOCKED" | null,
    reason: string | null
  ) {
    setPhaseAccessSaving(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/phase-access`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phaseId, status, reason }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update phase access");
        return;
      }
      const data: { phases: PhaseAccessItem[] } = await res.json();
      setPhaseAccess(data.phases);
      setPhaseAccessDialog(null);
      toast.success(
        status === null
          ? "Phase override cleared"
          : status === "OPEN"
          ? "Phase forced open for this attendee"
          : "Phase locked for this attendee"
      );
    } catch {
      toast.error("Failed to update phase access");
    } finally {
      setPhaseAccessSaving(false);
    }
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const registrationLink = contact
    ? contact.inviteToken
      ? `${appUrl}/register/${contact.event.slug}?token=${contact.inviteToken}`
      : `${appUrl}/register/${contact.event.slug}`
    : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(registrationLink);
      setCopied(true);
      toast.success("Registration link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  async function handleSave() {
    if (!contact) return;
    setSaving(true);
    try {
      const columnUpdates: Record<string, unknown> = {};
      const metadataUpdates: Record<string, unknown> = { ...(contact.metadata || {}) };

      for (const field of contact.formFields || []) {
        if (LAYOUT_TYPES.has(field.type)) continue;
        const value = editValues[field.name];
        if (COLUMN_FIELDS.has(field.name)) {
          columnUpdates[field.name] = value === "" || value === undefined ? null : value;
        } else {
          metadataUpdates[field.name] = value;
        }
      }

      const body = {
        ...columnUpdates,
        metadata: Object.keys(metadataUpdates).length > 0 ? metadataUpdates : null,
        category: editCategory || null,
        status: editStatus,
      };

      const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("Attendee updated");
        setEditing(false);
        fetchContact();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error?.fieldErrors ? "Validation error" : "Failed to update");
      }
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
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
          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === "COUNTRY") {
      return (
        <Select value={(value as string) || ""} onValueChange={setValue}>
          <SelectTrigger><SelectValue placeholder="Select country..." /></SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
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
              <Label htmlFor={`${field.name}-${o.value}`} className="text-sm">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
      );
    }
    if (field.type === "CHECKBOX") {
      return (
        <div className="flex items-center space-x-2">
          <Checkbox checked={Boolean(value)} onCheckedChange={(c) => setValue(Boolean(c))} id={field.name} />
          <Label htmlFor={field.name} className="text-sm">{field.label}</Label>
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
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c ? [...arr, o.value] : arr.filter((v) => v !== o.value);
                    setValue(next);
                  }}
                  id={`${field.name}-${o.value}`}
                />
                <Label htmlFor={`${field.name}-${o.value}`} className="text-sm">{o.label}</Label>
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
      <Input value={(value as string) || ""} onChange={(e) => setValue(e.target.value)} />
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  if (!contact) return null;

  const visibleFields = (contact.formFields || []).filter((f) => !LAYOUT_TYPES.has(f.type));
  const displayName = deriveDisplayName(contact, visibleFields);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/events/${eventId}/attendees`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{displayName.primary}</h1>
            {displayName.secondary && (
              <p className="text-sm text-muted-foreground">{displayName.secondary}</p>
            )}
          </div>
          <Badge variant={statusConfig[contact.status]?.variant || "secondary"} className="ml-2">
            {statusConfig[contact.status]?.label || contact.status}
          </Badge>
        </div>
        {userCanEdit && (
          <Button variant={editing ? "ghost" : "outline"} onClick={() => setEditing(!editing)}>
            <Pencil className="mr-2 h-4 w-4" />
            {editing ? "Cancel Edit" : "Edit"}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Attendee Information — mirrors the event's form definition */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Attendee Information</CardTitle>
          </CardHeader>
          <CardContent>
            {visibleFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This event has no form fields yet. Build the form in the form builder to collect attendee info.
              </p>
            ) : editing ? (
              <div className="space-y-4">
                {visibleFields.map((field) => (
                  <div key={field.name} className="space-y-1.5">
                    {field.type !== "CHECKBOX" && <Label>{field.label}</Label>}
                    {renderEditInput(field)}
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {/* Registration Link */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Registration Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                {contact.inviteToken
                  ? "Personal registration link for this attendee. Share it if they didn't receive the email."
                  : "This attendee has no invite token. They can use the general registration link."}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={registrationLink}
                  className="text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Admin — category/status/added (not part of the form) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                Admin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {editing ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    {contact.event.categories.length > 0 ? (
                      <Select value={editCategory} onValueChange={setEditCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {contact.event.categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ContactStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IMPORTED">Imported</SelectItem>
                        <SelectItem value="INVITED">Invited</SelectItem>
                        <SelectItem value="REGISTERED">Registered</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5" />Category
                    </span>
                    <span className="font-medium">{contact.category || "Uncategorized"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />Added
                    </span>
                    <span className="font-medium">
                      {new Date(contact.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Registration Info */}
          {contact.registration && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Registration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confirmation Code</span>
                  <span className="font-mono font-medium">{contact.registration.confirmationCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="default">{contact.registration.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registered At</span>
                  <span>{new Date(contact.registration.registeredAt).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phase Access — per-attendee override of post-reg phase visibility */}
          {contact.registration && phaseAccess && phaseAccess.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Phase Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Override the date-based open/close on a per-attendee basis. Useful when someone needs the form opened early or kept locked.
                </p>
                {phaseAccess.map((p) => {
                  const cfg = phaseStatusConfig[p.status];
                  return (
                    <div key={p.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{p.title}</p>
                          {(p.opensAt || p.closesAt) && (
                            <p className="text-xs text-muted-foreground">
                              {p.opensAt
                                ? `Opens ${new Date(p.opensAt).toLocaleString()}`
                                : "Always open"}
                              {p.closesAt
                                ? ` · Closes ${new Date(p.closesAt).toLocaleString()}`
                                : ""}
                            </p>
                          )}
                        </div>
                        <Badge variant={cfg.variant} className="shrink-0">
                          {cfg.label}
                        </Badge>
                      </div>

                      {p.override && p.reason && (
                        <p className="text-xs text-muted-foreground italic">
                          Reason: {p.reason}
                        </p>
                      )}

                      {userCanEdit && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Button
                            variant={p.override === null ? "default" : "outline"}
                            size="sm"
                            disabled={p.override === null || phaseAccessSaving}
                            onClick={() => submitPhaseAccess(p.id, null, null)}
                          >
                            Default
                          </Button>
                          <Button
                            variant={p.override === "OPEN" ? "default" : "outline"}
                            size="sm"
                            disabled={p.override === "OPEN" || phaseAccessSaving}
                            onClick={() =>
                              setPhaseAccessDialog({
                                phaseId: p.id,
                                phaseTitle: p.title,
                                nextStatus: "OPEN",
                                reason: p.reason ?? "",
                              })
                            }
                          >
                            <Unlock className="mr-1 h-3.5 w-3.5" />
                            Force Open
                          </Button>
                          <Button
                            variant={p.override === "LOCKED" ? "destructive" : "outline"}
                            size="sm"
                            disabled={p.override === "LOCKED" || phaseAccessSaving}
                            onClick={() =>
                              setPhaseAccessDialog({
                                phaseId: p.id,
                                phaseTitle: p.title,
                                nextStatus: "LOCKED",
                                reason: p.reason ?? "",
                              })
                            }
                          >
                            <Lock className="mr-1 h-3.5 w-3.5" />
                            Force Lock
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Badge */}
          {contact.registration?.status === "CONFIRMED" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  E-Badge
                  {contact.registration.badgeEmailSent && (
                    <Badge variant="default" className="ml-auto text-xs">Email Sent</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Badge is ready for this confirmed attendee.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/badge/${contact.registration!.confirmationCode}`, "_blank")}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  View Badge
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Email History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email History
                <Badge variant="outline" className="ml-auto">{contact.emailLogs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.emailLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails sent to this attendee yet.</p>
              ) : (
                <div className="space-y-2">
                  {contact.emailLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{log.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.sentAt ? new Date(log.sentAt).toLocaleString() : "Queued"}
                        </p>
                      </div>
                      <Badge
                        variant={log.status === "SENT" ? "default" : log.status === "FAILED" ? "destructive" : "secondary"}
                        className="ml-2 shrink-0"
                      >
                        {log.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Phase access override dialog */}
      <Dialog
        open={phaseAccessDialog !== null}
        onOpenChange={(open) => {
          if (!open) setPhaseAccessDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {phaseAccessDialog?.nextStatus === "OPEN"
                ? "Force open this phase"
                : "Lock this phase"}
            </DialogTitle>
            <DialogDescription>
              {phaseAccessDialog?.nextStatus === "OPEN"
                ? `Override the schedule and let this attendee fill "${phaseAccessDialog?.phaseTitle}" right now.`
                : `Prevent this attendee from filling "${phaseAccessDialog?.phaseTitle}", regardless of the schedule.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="phase-access-reason">Reason (optional)</Label>
            <Textarea
              id="phase-access-reason"
              rows={3}
              placeholder="e.g. Travelling early, attending a different track, etc."
              value={phaseAccessDialog?.reason ?? ""}
              onChange={(e) =>
                setPhaseAccessDialog((prev) =>
                  prev ? { ...prev, reason: e.target.value } : prev
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Visible to admins on this attendee's record. Not shown to the attendee.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPhaseAccessDialog(null)}
              disabled={phaseAccessSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!phaseAccessDialog) return;
                submitPhaseAccess(
                  phaseAccessDialog.phaseId,
                  phaseAccessDialog.nextStatus,
                  phaseAccessDialog.reason.trim() || null
                );
              }}
              disabled={phaseAccessSaving}
              variant={phaseAccessDialog?.nextStatus === "LOCKED" ? "destructive" : "default"}
            >
              {phaseAccessSaving
                ? "Saving..."
                : phaseAccessDialog?.nextStatus === "OPEN"
                ? "Force open"
                : "Lock phase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
