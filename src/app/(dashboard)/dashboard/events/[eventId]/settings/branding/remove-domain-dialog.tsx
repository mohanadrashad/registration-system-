"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Remove-custom-domain confirmation dialog. Mounted at the page root (not
// inside the Domain tab) so switching tabs can't unmount it mid-flow.
export function RemoveDomainDialog({
  open,
  onOpenChange,
  customDomain,
  removing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customDomain: string | undefined;
  removing: boolean;
  onConfirm: () => void;
}) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove Custom Domain
            </DialogTitle>
            <DialogDescription>
              This will disconnect{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {customDomain}
              </code>{" "}
              from this event. Emails, badge links, and QR codes will immediately
              fall back to the default URL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="font-medium">You&apos;ll also want to clean up externally:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Remove the domain from your Vercel project&apos;s Domains settings.</li>
              <li>Delete the CNAME record in your DNS provider.</li>
              <li>Delete the TXT verification record if still present.</li>
            </ul>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={removing}
            >
              {removing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Domain"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
