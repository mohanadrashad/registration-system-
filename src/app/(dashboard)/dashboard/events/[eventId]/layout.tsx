import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const session = await auth();
  const role = getRole(session);
  const userId = session?.user?.id;

  if (!userId) notFound();

  if (role !== "SUPER_ADMIN") {
    const membership = await prisma.eventMember.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { id: true },
    });
    if (!membership) notFound();
  }

  return <DashboardShell eventId={eventId}>{children}</DashboardShell>;
}
