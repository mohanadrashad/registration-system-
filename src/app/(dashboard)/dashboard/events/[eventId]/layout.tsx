"use client";

import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function EventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const eventId = params.eventId as string;

  return <DashboardShell eventId={eventId}>{children}</DashboardShell>;
}
