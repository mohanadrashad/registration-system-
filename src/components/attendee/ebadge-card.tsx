"use client";

import { Award, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ContactDetail, isSyntheticEmail } from "./field-display";

/**
 * E-Badge card. View-only — per the original Decision B there is no
 * per-attendee email-badge action in the codebase, so no Email button
 * is rendered. The three delivery states surfaced here are read-only
 * indicators driven by `badgeGenerated`, `badgeEmailSent`, and whether
 * the contact has a real email on record.
 */
export function EBadgeCard({
  registration,
  email,
}: {
  registration: ContactDetail["registration"];
  email: string | null | undefined;
}) {
  const confirmed = registration?.status === "CONFIRMED";
  const generated = !!registration?.badgeGenerated;
  const emailSent = !!registration?.badgeEmailSent;
  const noEmail = isSyntheticEmail(email);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Award className="h-4 w-4" />
          E-Badge
          {confirmed && emailSent && (
            <Badge variant="default" className="ml-auto text-xs">
              Email Sent
            </Badge>
          )}
          {confirmed && generated && !emailSent && noEmail && (
            <Badge variant="outline" className="ml-auto text-xs text-muted-foreground">
              No email
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {confirmed && registration ? (
          <>
            <p className="text-sm text-muted-foreground">
              Badge is ready for this confirmed attendee.
            </p>
            {generated && !emailSent && (
              <p className="text-xs text-muted-foreground">
                {noEmail
                  ? "Not delivered — no email on record."
                  : "Delivery pending."}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(`/badge/${registration.confirmationCode}`, "_blank")
              }
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              View badge
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not yet generated. The badge becomes available once the
            registration is confirmed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
