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

  // Refetches triggered by user actions must pass { silent: true }.
  // Toggling `loading` collapses the entire JSX tree to <Loader2 /> via
  // the render guard below, which races React's commit phase against
  // toast.success() portal mounts and `finally`-block setState cleanups
  // → DOMException in commitPlacement. Initial mount keeps the full
  // spinner; everything else refreshes silently. See
  // [[radix-dialog-post-refetch-race]] memory for the full diagnosis.
  async function fetchData(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/approvals`);
      if (res.ok) {
        const data = await res.json();
        setCapacityInfo(data.capacity);
        setPendingApprovals(data.pendingApprovals);
        setWaitlist(data.waitlist);
        setRecentDecisions(data.recentDecisions ?? []);
        setTotalRecentDecisions(data.totalRecentDecisions ?? 0);
        // Don't wipe the user's in-progress draft on action-triggered refetches.
        // Initial-mount load syncs the input; afterward newCapacity is user-owned.
        if (!opts.silent) setNewCapacity(data.capacity?.capacity?.toString() || "");
      }
    } catch (error) {
      console.error("Failed to fetch approvals:", error);
      toast.error("Failed to load approval data");
    } finally {
      if (!opts.silent) setLoading(false);
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
        fetchData({ silent: true });
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
        fetchData({ silent: true });
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
        fetchData({ silent: true });
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
        fetchData({ silent: true });
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
        <Button variant="outline" onClick={() => fetchData({ silent: true })}>
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
                  {/* Source #1 of placement-race fix: always-mount span; CSS-hide
                      when capacity is null. Avoids conditional-mount placement
                      during saveCapacity refetch — see [[radix-dialog-post-refetch-race]]. */}
                  <span className={`text-sm text-muted-foreground ${capacityInfo?.capacity ? "" : "hidden"}`}>
                    /{capacityInfo?.capacity ?? ""}
                  </span>
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
                {/* Source #2 of placement-race fix: both icons always mount;
                    CSS-hides the inactive one. Component-type swap was the
                    primary saveCapacity race trigger. */}
                <AlertCircle className={`h-5 w-5 text-red-600 ${capacityInfo?.isAtCapacity ? "" : "hidden"}`} />
                <CheckCircle className={`h-5 w-5 text-green-600 ${capacityInfo?.isAtCapacity ? "hidden" : ""}`} />
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
              {/* Source #3 of placement-race fix: Loader2 always mounts;
                  CSS-hide when not saving. Defensive against cumulative
                  placement pressure during save commits. */}
              <Loader2 className={`mr-2 h-4 w-4 animate-spin ${savingCapacity ? "" : "hidden"}`} />
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
              {/* Source #4 of placement-race fix: always-mount both branches.
                  Empty-state ternary swap previously raced commitDeletion when
                  the list emptied (approve/reject the last pending row). Now:
                  always mount both <p> and the wrapper <div>; CSS-hide the
                  inactive one. shadcn Table routes className to the inner
                  <table>, so wrap in a div for visibility toggling. */}
              <p className={`text-center text-muted-foreground py-8 ${pendingApprovals.length === 0 ? "" : "hidden"}`}>
                No pending approvals
              </p>
              <div className={pendingApprovals.length === 0 ? "hidden" : ""}>
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
                            {/* Source #8 of placement-race fix: always-mount
                                Loader2 + label span; CSS-hide based on
                                processingId. Prevents the inner content
                                swap from racing the row deletion when
                                handleApprove removes this row from
                                pendingApprovals. */}
                            <Loader2 className={`h-4 w-4 animate-spin ${processingId === reg.id ? "" : "hidden"}`} />
                            <span className={`inline-flex items-center ${processingId === reg.id ? "hidden" : ""}`}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </span>
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
              </div>
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
              {/* Source #5 of placement-race fix: same empty-state pattern as
                  #4. Fires on handlePromote when the last waitlist row gets
                  promoted, emptying the list. */}
              <p className={`text-center text-muted-foreground py-8 ${waitlist.length === 0 ? "" : "hidden"}`}>
                No one on waitlist
              </p>
              <div className={waitlist.length === 0 ? "hidden" : ""}>
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
                          {/* Sources #6 + #9 + #11 of placement-race fix:
                              always-mount Button on every waitlist row;
                              CSS-hide unless this is index 0 AND not at
                              capacity. Inner content (Loader2 + label span)
                              also always-mounted, CSS-hide based on
                              processingId. Phase 3 #11 catch: the previous
                              {index === 0 && ...} outer gate was itself a
                              conditional mount that fires on row shifts
                              when handlePromote removes the first row. */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePromote(reg.id)}
                            disabled={processingId === reg.id}
                            className={index === 0 && !capacityInfo?.isAtCapacity ? "" : "hidden"}
                          >
                            <Loader2 className={`h-4 w-4 animate-spin ${processingId === reg.id ? "" : "hidden"}`} />
                            <span className={`inline-flex items-center ${processingId === reg.id ? "hidden" : ""}`}>
                              <ArrowUp className="h-4 w-4 mr-1" />
                              Promote
                            </span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
              {/* Source #7 of placement-race fix: same empty-state pattern as
                  #4 and #5. Fires on approve/reject when the FIRST decision
                  is added (list goes 0 → 1). */}
              <p className={`text-center text-muted-foreground py-8 ${recentDecisions.length === 0 ? "" : "hidden"}`}>
                No recent decisions yet
              </p>
              <div className={recentDecisions.length === 0 ? "hidden" : ""}>
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
                  {/* Source #7b of placement-race fix: truncation footer
                      conditional mount. Fires when approvals push total past
                      100 (server-side cap on recentDecisions array). Rare
                      but real — fix it now so we never reopen this when a
                      real event crosses 100 decisions. */}
                  <p className={`mt-3 text-xs text-muted-foreground text-center ${totalRecentDecisions > recentDecisions.length ? "" : "hidden"}`}>
                    Showing {recentDecisions.length} most recent decisions of{" "}
                    {totalRecentDecisions} total
                  </p>
              </div>
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
              {/* Source #10 of placement-race fix: always-mount Loader2;
                  CSS-hide when not processing. Prevents inner content
                  swap from racing the Dialog Presence unmount when
                  handleReject closes the dialog. */}
              <Loader2 className={`mr-2 h-4 w-4 animate-spin ${processingId === selectedRegistration?.id ? "" : "hidden"}`} />
              Reject Registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
