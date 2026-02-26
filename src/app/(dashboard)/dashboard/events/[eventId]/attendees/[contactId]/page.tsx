"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  User,
  Building,
  Phone,
  Briefcase,
  Tag,
  Clock,
  ExternalLink,
} from "lucide-react";

type ContactStatus = "IMPORTED" | "INVITED" | "REGISTERED" | "CANCELLED";

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
  createdAt: string;
  updatedAt: string;
  registration: { status: string; registeredAt: string; confirmationCode: string } | null;
  emailLogs: { id: string; status: string; sentAt: string | null; subject: string }[];
  event: { slug: string; name: string; categories: string[] };
}

const statusConfig: Record<ContactStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  IMPORTED: { label: "Imported", variant: "secondary", color: "text-blue-600" },
  INVITED: { label: "Invited", variant: "outline", color: "text-orange-600" },
  REGISTERED: { label: "Registered", variant: "default", color: "text-green-600" },
  CANCELLED: { label: "Cancelled", variant: "destructive", color: "text-red-600" },
};

export default function AttendeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const contactId = params.contactId as string;

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    organization: "",
    designation: "",
    category: "",
    status: "IMPORTED" as string,
  });

  const fetchContact = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setContact(data);
      setEditForm({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || "",
        organization: data.organization || "",
        designation: data.designation || "",
        category: data.category || "",
        status: data.status,
      });
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
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          email: editForm.email,
          phone: editForm.phone || null,
          organization: editForm.organization || null,
          designation: editForm.designation || null,
          category: editForm.category || null,
          status: editForm.status,
        }),
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

  if (loading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  if (!contact) return null;

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
            <h1 className="text-2xl font-bold">{contact.firstName} {contact.lastName}</h1>
            <p className="text-sm text-muted-foreground">{contact.email}</p>
          </div>
          <Badge variant={statusConfig[contact.status]?.variant || "secondary"} className="ml-2">
            {statusConfig[contact.status]?.label || contact.status}
          </Badge>
        </div>
        <Button variant={editing ? "ghost" : "outline"} onClick={() => setEditing(!editing)}>
          <Pencil className="mr-2 h-4 w-4" />
          {editing ? "Cancel Edit" : "Edit"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={editForm.firstName}
                      onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={editForm.lastName}
                      onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Input
                    value={editForm.organization}
                    onChange={(e) => setEditForm({ ...editForm, organization: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input
                    value={editForm.designation}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    {contact.event.categories.length > 0 ? (
                      <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
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
                      <Input
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IMPORTED">Imported</SelectItem>
                        <SelectItem value="INVITED">Invited</SelectItem>
                        <SelectItem value="REGISTERED">Registered</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <InfoRow icon={User} label="Name" value={`${contact.firstName} ${contact.lastName}`} />
                <InfoRow icon={Mail} label="Email" value={contact.email} />
                <InfoRow icon={Phone} label="Phone" value={contact.phone || "-"} />
                <InfoRow icon={Building} label="Organization" value={contact.organization || "-"} />
                <InfoRow icon={Briefcase} label="Designation" value={contact.designation || "-"} />
                <InfoRow icon={Tag} label="Category" value={contact.category || "Uncategorized"} />
                <InfoRow icon={Clock} label="Added" value={new Date(contact.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Registration Link + Registration Info */}
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
                  ? "This is the personal registration link for this attendee. Share it if they didn't receive the email."
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
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
