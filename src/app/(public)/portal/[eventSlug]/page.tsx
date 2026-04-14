"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Mail,
  Phone,
  Building2,
  Briefcase,
  Download,
  Edit,
  Loader2,
  LogOut,
  AlertTriangle,
} from "lucide-react";

interface EventInfo {
  name: string;
  description?: string;
  venue?: string;
  startDate: string;
  endDate: string;
}

interface RegistrationInfo {
  id: string;
  status: string;
  confirmationCode: string;
  registeredAt?: string;
  badgeGenerated: boolean;
  badgeUrl?: string;
}

interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  organization?: string;
  designation?: string;
}

export default function PortalPage() {
  const params = useParams();
  const eventSlug = params.eventSlug as string;

  // Login state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Data state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [registration, setRegistration] = useState<RegistrationInfo | null>(null);
  const [contact, setContact] = useState<ContactInfo | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editOrganization, setEditOrganization] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [saving, setSaving] = useState(false);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");

    try {
      const res = await fetch(
        `/api/portal/${eventSlug}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`
      );

      const data = await res.json();

      if (res.ok) {
        setEvent(data.event);
        setRegistration(data.registration);
        setContact(data.contact);
        setEditPhone(data.contact.phone || "");
        setEditOrganization(data.contact.organization || "");
        setEditDesignation(data.contact.designation || "");
        setIsLoggedIn(true);
      } else {
        setLoginError(data.error || "Login failed");
      }
    } catch (error) {
      setLoginError("Failed to connect. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleSave() {
    setSaving(true);

    try {
      const res = await fetch(`/api/portal/${eventSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          updates: {
            phone: editPhone,
            organization: editOrganization,
            designation: editDesignation,
          },
        }),
      });

      if (res.ok) {
        setContact({
          ...contact!,
          phone: editPhone,
          organization: editOrganization,
          designation: editDesignation,
        });
        setEditing(false);
      }
    } catch (error) {
      // Error handling
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
        body: JSON.stringify({
          email,
          code,
          action: "cancel",
        }),
      });

      if (res.ok) {
        setRegistration({
          ...registration!,
          status: "CANCELLED",
        });
        setCancelDialogOpen(false);
      }
    } catch (error) {
      // Error handling
    } finally {
      setCancelling(false);
    }
  }

  function logout() {
    setIsLoggedIn(false);
    setEvent(null);
    setRegistration(null);
    setContact(null);
    setEmail("");
    setCode("");
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

  // Login form
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Attendee Portal</CardTitle>
            <CardDescription>
              View and manage your registration
            </CardDescription>
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

  // Portal view
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{event?.name}</h1>
            <p className="text-muted-foreground">Attendee Portal</p>
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
              <p className="font-mono text-lg font-semibold">
                {registration?.confirmationCode}
              </p>
            </div>

            {/* Badge Download */}
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

        {/* Contact Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Your Details</CardTitle>
              {!editing && registration?.status !== "CANCELLED" && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">First Name</Label>
                    <p className="font-medium">{contact?.firstName}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Name</Label>
                    <p className="font-medium">{contact?.lastName}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-medium">{contact?.email}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editPhone">Phone</Label>
                  <Input
                    id="editPhone"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editOrganization">Organization</Label>
                  <Input
                    id="editOrganization"
                    value={editOrganization}
                    onChange={(e) => setEditOrganization(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editDesignation">Designation</Label>
                  <Input
                    id="editDesignation"
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium">
                        {contact?.firstName} {contact?.lastName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">{contact?.email}</p>
                    </div>
                  </div>
                </div>

                {contact?.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium">{contact.phone}</p>
                    </div>
                  </div>
                )}

                {contact?.organization && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Organization</p>
                      <p className="font-medium">{contact.organization}</p>
                    </div>
                  </div>
                )}

                {contact?.designation && (
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Designation</p>
                      <p className="font-medium">{contact.designation}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
              <Button
                variant="destructive"
                onClick={() => setCancelDialogOpen(true)}
              >
                Cancel My Registration
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Cancel Dialog */}
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
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Yes, Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
