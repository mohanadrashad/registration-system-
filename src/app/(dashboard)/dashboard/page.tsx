export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Calendar, Users, ClipboardList, Mail } from "lucide-react";

export default async function DashboardPage() {
  let eventCount = 0;
  let contactCount = 0;
  let registrationCount = 0;
  let campaignCount = 0;

  try {
    eventCount = await prisma.event.count();
    contactCount = await prisma.contact.count();
    registrationCount = await prisma.registration.count();
    campaignCount = await prisma.emailCampaign.count();
  } catch (e) {
    console.error("Failed to fetch dashboard stats:", e);
  }

  const stats = [
    { title: "Total Events", value: eventCount, icon: Calendar },
    { title: "Total Contacts", value: contactCount, icon: Users },
    { title: "Registrations", value: registrationCount, icon: ClipboardList },
    { title: "Email Campaigns", value: campaignCount, icon: Mail },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Overview of your registration system"
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
