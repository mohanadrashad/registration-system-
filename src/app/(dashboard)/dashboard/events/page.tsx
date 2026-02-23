export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Plus, Calendar, Users, ClipboardList } from "lucide-react";
import { format } from "date-fns";

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { contacts: true, registrations: true } },
    },
  });

  return (
    <DashboardShell>
    <div className="space-y-6">
      <PageHeader title="Events" description="Manage your events">
        <Link href="/dashboard/events/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </Link>
      </PageHeader>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No events yet</p>
            <p className="text-sm text-muted-foreground">Create your first event to get started</p>
            <Link href="/dashboard/events/new" className="mt-4">
              <Button>Create Event</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link key={event.id} href={`/dashboard/events/${event.id}/contacts`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{event.name}</CardTitle>
                    <Badge variant={event.isActive ? "default" : "secondary"}>
                      {event.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(event.startDate), "MMM d, yyyy")} -{" "}
                    {format(new Date(event.endDate), "MMM d, yyyy")}
                  </p>
                </CardHeader>
                <CardContent>
                  {event.venue && (
                    <p className="mb-3 text-sm text-muted-foreground">{event.venue}</p>
                  )}
                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{event._count.contacts} contacts</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      <span>{event._count.registrations} registered</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
    </DashboardShell>
  );
}
