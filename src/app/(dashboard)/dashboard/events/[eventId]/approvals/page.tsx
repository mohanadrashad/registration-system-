"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";
import {
  CheckCircle,
  XCircle,
  Clock,
  Users,
  ListOrdered,
  ArrowUp,
  RefreshCw,
  Loader2,
  AlertCircle,
  History,
} from "lucide-react";

interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  organization?: string;
}

interface Registration {
  id: string;
  confirmationCode: string;
  status: string;
  createdAt: string;
  contact: Contact;
}

// Stage 4 of ADMIN_EDIT_FIX_SPEC: Recent Decisions tab row shape.
// Only includes the columns + relations the table renders — the
// approval.service.getRecentDecisions sends the full Registration
// row but the UI is narrow on purpose.
interface RecentDecision {
  id: string;
  status: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  approver: { id: string; name: string | null; email: string } | null;
  rejecter: { id: string; name: string | null; email: string } | null;
  contact: { firstName: string; lastName: string; email: string };
}

interface CapacityInfo {
  capacity: number | null;
  confirmed: number;
  pendingApproval: number;
  waitlisted: number;
  available: number | null;
  isAtCapacity: boolean;
  approvalRequired: boolean;
  waitlistEnabled: boolean;
}

export default function ApprovalsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [capacityInfo, setCapacityInfo] = useState<CapacityInfo | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<Registration[]>([]);
  const [waitlist, setWaitlist] = useState<Registration[]>([]);
  const [recentDecisions, setRecentDecisions] = useState<RecentDecision[]>([]);
  const [totalRecentDecisions, setTotalRecentDecisions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [newCapacity, setNewCapacity] = useState<string>("");
  const [savingCapacity, setSavingCapacity] = useState(false);

  useEffect(() => {
    fetchData();
  }, [eventId]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/approvals`);
      if (res.ok) {
        const data = await res.json();
        setCapacityInfo(data.capacity);
        setPendingApprovals(data.pendingApprovals);
        setWaitlist(data.waitlist);
        setRecentDecisions(data.recentDecisions ?? []);
        setTotalRecentDecisions(data.totalRecentDecisions ?? 0);
        setNewCapacity(data.capacity?.capacity?.toString() || "");
      }
    } catch (error) {
      console.error("Failed to fetch approvals:", error);
      toast.error("Failed to load approval data");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(registrationId: string) {
    setProcessingId(registrationId);
    try {
      const res = await fetch(`/api/events/${eventId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", registrationId }),
      });

      if (res.ok) {
        toast.success("Registration approved");
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to approve");
      }
    } catch (error) {
      toast.error("Failed to approve registration");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject() {
    if (!selectedRegistration) return;

    setProcessingId(selectedRegistration.id);
    try {
      const res = await fetch(`/api/events/${eventId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          registrationId: selectedRegistration.id,
          reason: rejectReason,
        }),
      });

      if (res.ok) {
        toast.success("Registration rejected");
        setRejectDialogOpen(false);
        setSelectedRegistration(null);
        setRejectReason("");
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to reject");
      }
    } catch (error) {
      toast.error("Failed to reject registration");
    } finally {
      setProcessingId(null);
    }
  }

  async function handlePromote(registrationId: string) {
    setProcessingId(registrationId);
    try {
      const res = await fetch(`/api/events/${eventId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", registrationId }),
      });

      if (res.ok) {
        toast.success("Person promoted from waitlist");
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to promote");
      }
    } catch (error) {
      toast.error("Failed to promote from waitlist");
    } finally {
      setProcessingId(null);
    }
  }

  async function saveCapacity() {
    setSavingCapacity(true);
    try {
      const capacity = newCapacity === "" ? null : parseInt(newCapacity);

      const res = await fetch(`/api/events/${eventId}/capacity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity }),
      });

      if (res.ok) {
        toast.success("Capacity updated");
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to update capacity");
      }
    } catch (error) {
      toast.error("Failed to update capacity");
    } finally {
      setSavingCapacity(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals & Waitlist"
        description="Manage registration approvals and waitlist"
      >
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      {/* Capacity Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-blue-100 p-3">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {capacityInfo?.confirmed || 0}
                  {capacityInfo?.capacity && (
                    <span className="text-sm text-muted-foreground">
                      /{capacityInfo.capacity}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">Confirmed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-yellow-100 p-3">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{capacityInfo?.pendingApproval || 0}</p>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-purple-100 p-3">
                <ListOrdered className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{capacityInfo?.waitlisted || 0}</p>
                <p className="text-sm text-muted-foreground">On Waitlist</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`rounded-full p-3 ${capacityInfo?.isAtCapacity ? "bg-red-100" : "bg-green-100"}`}>
                {capacityInfo?.isAtCapacity ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {capacityInfo?.available ?? "∞"}
                </p>
                <p className="text-sm text-muted-foreground">Spots Available</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capacity Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Event Capacity</CardTitle>
          <CardDescription>
            Set the maximum number of registrations for this event
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="capacity">Maximum Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min="0"
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value)}
                placeholder="Unlimited"
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for unlimited capacity
              </p>
            </div>
            <Button onClick={saveCapacity} disabled={savingCapacity}>
              {savingCapacity ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Pending, Waitlist, and Recent Decisions */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            <Clock className="w-4 h-4 mr-2" />
            Pending Approval ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="waitlist">
            <ListOrdered className="w-4 h-4 mr-2" />
            Waitlist ({waitlist.length})
          </TabsTrigger>
          <TabsTrigger value="recent">
            <History className="w-4 h-4 mr-2" />
            Recent Decisions ({totalRecentDecisions})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Approvals</CardTitle>
              <CardDescription>
                Review and approve or reject registration requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingApprovals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No pending approvals
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingApprovals.map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell className="font-medium">
                          {reg.contact.firstName} {reg.contact.lastName}
                        </TableCell>
                        <TableCell className={isSyntheticEmail(reg.contact.email) ? "text-muted-foreground" : ""}>
                          {isSyntheticEmail(reg.contact.email) ? "—" : reg.contact.email}
                        </TableCell>
                        <TableCell>{reg.contact.organization || "-"}</TableCell>
                        <TableCell>
                          {new Date(reg.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(reg.id)}
                            disabled={processingId === reg.id}
                          >
                            {processingId === reg.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedRegistration(reg);
                              setRejectDialogOpen(true);
                            }}
                            disabled={processingId === reg.id}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waitlist" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Waitlist</CardTitle>
              <CardDescription>
                People waiting for a spot to open up (first come, first served)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {waitlist.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No one on waitlist
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Joined Waitlist</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waitlist.map((reg, index) => (
                      <TableRow key={reg.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {reg.contact.firstName} {reg.contact.lastName}
                        </TableCell>
                        <TableCell className={isSyntheticEmail(reg.contact.email) ? "text-muted-foreground" : ""}>
                          {isSyntheticEmail(reg.contact.email) ? "—" : reg.contact.email}
                        </TableCell>
                        <TableCell>{reg.contact.organization || "-"}</TableCell>
                        <TableCell>
                          {new Date(reg.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {index === 0 && !capacityInfo?.isAtCapacity && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePromote(reg.id)}
                              disabled={processingId === reg.id}
                            >
                              {processingId === reg.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <ArrowUp className="h-4 w-4 mr-1" />
                                  Promote
                                </>
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stage 4 of ADMIN_EDIT_FIX_SPEC: Recent Decisions tab.
            Read-only history of approval/rejection events. Filtered
            server-side to rows with approvedAt OR rejectedAt set —
            legacy pre-Stage-1 rows don't appear because their audit
            columns are null. Capped at 100; footer surfaces total
            only when truncated. */}
        <TabsContent value="recent" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Decisions</CardTitle>
              <CardDescription>
                Approval and rejection history for this event.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentDecisions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No recent decisions yet
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>By</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentDecisions.map((reg) => {
                        const wasRejected = reg.rejectedAt !== null;
                        const actor = wasRejected ? reg.rejecter : reg.approver;
                        const when = wasRejected ? reg.rejectedAt : reg.approvedAt;
                        return (
                          <TableRow key={reg.id}>
                            <TableCell className="font-medium">
                              {reg.contact.firstName} {reg.contact.lastName}
                            </TableCell>
                            <TableCell>
                              {wasRejected ? (
                                <span className="inline-flex items-center gap-1 text-destructive">
                                  <XCircle className="h-4 w-4" />
                                  Rejected
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-600">
                                  <CheckCircle className="h-4 w-4" />
                                  Approved
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {actor ? (
                                <span className="font-medium">
                                  {actor.name ?? actor.email}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">
                                  (unknown)
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {when
                                ? new Date(when).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell
                              className="max-w-xs truncate"
                              title={reg.rejectionReason ?? undefined}
                            >
                              {reg.rejectionReason ?? (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {totalRecentDecisions > recentDecisions.length && (
                    <p className="mt-3 text-xs text-muted-foreground text-center">
                      Showing {recentDecisions.length} most recent decisions of{" "}
                      {totalRecentDecisions} total
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject{" "}
              {selectedRegistration?.contact.firstName} {selectedRegistration?.contact.lastName}'s
              registration?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejection..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processingId === selectedRegistration?.id}
            >
              {processingId === selectedRegistration?.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reject Registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
