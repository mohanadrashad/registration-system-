"use client";

import {
  Calendar,
  CheckCircle,
  Clock,
  Download,
  MapPin,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventInfo, RegistrationInfo } from "./types";
import type { PortalT } from "./portal-strings";

// Registration Status card: status badge, event date/venue, confirmation
// code, and the badge download button when one has been generated.
export function StatusCard({
  registration,
  event,
  t,
  tag,
}: {
  registration: RegistrationInfo | null;
  event: EventInfo | null;
  t: PortalT;
  // From localeTag(lang) — undefined means the browser's default locale.
  tag: string | undefined;
}) {
  function getStatusBadge(status: string) {
    switch (status) {
      case "CONFIRMED":
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t.confirmed}
          </Badge>
        );
      case "PENDING":
      case "PENDING_APPROVAL":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            {t.pending}
          </Badge>
        );
      case "WAITLISTED":
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            {t.waitlisted}
          </Badge>
        );
      case "CANCELLED":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            {t.cancelled}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t.registrationStatus}</CardTitle>
          {getStatusBadge(registration?.status || "")}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{t.eventDate}</p>
              <p className="text-muted-foreground">
                {event?.startDate &&
                  new Date(event.startDate).toLocaleDateString(tag)}
              </p>
            </div>
          </div>
          {event?.venue && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">{t.venue}</p>
                <p className="text-muted-foreground">{event.venue}</p>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-1">
            {t.confirmationCode}
          </p>
          {/* Confirmation code is alphanumeric / kept in monospace LTR
              even in RTL — it's a machine identifier, not Arabic text. */}
          <p
            className="font-mono text-lg font-semibold"
            dir="ltr"
            style={{ unicodeBidi: "isolate" }}
          >
            {registration?.confirmationCode}
          </p>
        </div>

        {registration?.badgeGenerated && registration?.badgeUrl && (
          <div className="pt-4 border-t">
            <Button asChild className="w-full">
              <a href={registration.badgeUrl} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                {t.downloadBadge}
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
