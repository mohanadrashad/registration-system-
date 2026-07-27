"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PortalT } from "./portal-strings";

// Cancel Registration card + confirmation dialog. Hidden once the
// registration is already cancelled. The page owns the dialog state and
// the actual cancel call.
export function CancelCard({
  registrationStatus,
  eventName,
  t,
  isRtl,
  dialogOpen,
  onDialogOpenChange,
  cancelling,
  onConfirmCancel,
}: {
  registrationStatus: string | undefined;
  eventName: string;
  t: PortalT;
  isRtl: boolean;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  cancelling: boolean;
  onConfirmCancel: () => void;
}) {
  return (
    <>
      {registrationStatus !== "CANCELLED" && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">
              {t.cancelRegistration}
            </CardTitle>
            <CardDescription>{t.cancelRegistrationDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => onDialogOpenChange(true)}>
              {t.cancelMyRegistration}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent dir={isRtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t.cancelRegistration}
            </DialogTitle>
            <DialogDescription>
              {t.cancelDialogQuestion(eventName)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onDialogOpenChange(false)}>
              {t.keepRegistration}
            </Button>
            <Button variant="destructive" onClick={onConfirmCancel} disabled={cancelling}>
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.yesCancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
