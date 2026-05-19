"use client";

import { useState } from "react";
import { Award, Ban, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContactDetail, ContactStatus } from "./field-display";

type Pending = "regenerate" | "cancel" | null;

/**
 * Quick actions — only the actions confirmed to already exist by the
 * Stage 0 audit:
 *  - Regenerate badge → POST /badges/generate scoped to this
 *    registration id (Decision A surfaced the id).
 *  - Cancel registration → existing contact PUT, status=CANCELLED
 *    (the same call the edit form already makes).
 * Resend confirmation email was dropped (Decision C — no one-click
 * form exists; the send-email endpoint requires template selection).
 * Both actions are guarded by a confirmation dialog.
 */
export function QuickActionsCard({
  eventId,
  contactId,
  registration,
  contactStatus,
  onChanged,
}: {
  eventId: string;
  contactId: string;
  registration: ContactDetail["registration"];
  contactStatus: ContactStatus;
  onChanged: () => void | Promise<void>;
}) {
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState<Pending>(null);

  const canRegenerate = !!registration?.id;
  const alreadyCancelled = contactStatus === "CANCELLED";

  async function regenerate() {
    if (!registration?.id) return;
    setBusy("regenerate");
    try {
      const res = await fetch(`/api/events/${eventId}/badges/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationIds: [registration.id] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to regenerate badge.");
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { generated?: number }
        | null;
      if (body && typeof body.generated === "number" && body.generated === 0) {
        toast.warning(
          "Nothing regenerated — the registration must be confirmed first."
        );
      } else {
        toast.success("Badge regenerated.");
      }
      await onChanged();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function cancelRegistration() {
    setBusy("cancel");
    try {
      const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to cancel registration.");
        return;
      }
      toast.success("Registration cancelled.");
      await onChanged();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Quick actions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={!canRegenerate || busy !== null}
          onClick={() => setConfirm("regenerate")}
        >
          {busy === "regenerate" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Award className="mr-2 h-3.5 w-3.5" />
          )}
          Regenerate badge
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start text-destructive hover:text-destructive"
          disabled={alreadyCancelled || busy !== null}
          onClick={() => setConfirm("cancel")}
        >
          {busy === "cancel" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Ban className="mr-2 h-3.5 w-3.5" />
          )}
          {alreadyCancelled ? "Registration cancelled" : "Cancel registration"}
        </Button>
      </CardContent>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && busy === null && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "regenerate"
                ? "Regenerate badge?"
                : "Cancel this registration?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "regenerate"
                ? "This overwrites the attendee's existing badge with a freshly generated one. The confirmation code and QR stay the same."
                : "This sets the attendee's status to Cancelled. They will be treated as not attending. You can re-enable them later by editing their status."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={busy !== null}
            >
              Keep as is
            </Button>
            <Button
              variant={confirm === "cancel" ? "destructive" : "default"}
              onClick={confirm === "regenerate" ? regenerate : cancelRegistration}
              disabled={busy !== null}
            >
              {busy !== null && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              {confirm === "regenerate" ? "Regenerate" : "Cancel registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
