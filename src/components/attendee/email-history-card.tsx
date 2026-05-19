"use client";

import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ContactDetail } from "./field-display";

/**
 * Email history for this contact. Same data source and ordering as
 * before (emailLogs, already sorted desc by sentAt server-side). Per
 * the spec's Open Question 2 default: show all rows, no cap — most
 * attendees have well under 10 emails and pagination is over-engineering
 * for v1.
 */
export function EmailHistoryCard({
  emailLogs,
}: {
  emailLogs: ContactDetail["emailLogs"];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email history
          <Badge variant="outline" className="ml-auto">
            {emailLogs.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {emailLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No emails sent to this attendee yet.
          </p>
        ) : (
          <div className="space-y-2">
            {emailLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{log.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.sentAt ? new Date(log.sentAt).toLocaleString() : "Queued"}
                  </p>
                </div>
                <Badge
                  variant={
                    log.status === "SENT"
                      ? "default"
                      : log.status === "FAILED"
                      ? "destructive"
                      : "secondary"
                  }
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
  );
}
