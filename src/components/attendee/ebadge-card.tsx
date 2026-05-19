"use client";

import { Award, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContactDetail } from "./field-display";

/**
 * E-Badge card. View-only, matching today's behaviour (per Decision B —
 * there is no per-attendee email-badge action in the codebase, so no
 * Email button is rendered). When the registration is confirmed the
 * badge is viewable; otherwise a "not yet generated" placeholder shows.
 */
export function EBadgeCard({
  registration,
}: {
  registration: ContactDetail["registration"];
}) {
  const confirmed = registration?.status === "CONFIRMED";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Award className="h-4 w-4" />
          E-Badge
          {confirmed && registration?.badgeEmailSent && (
            <Badge variant="default" className="ml-auto text-xs">
              Email Sent
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
