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

  // Parallelize membership check + module fetch. Modules feeds the
  // sidebar gate so menu items hide when their module is off.
  const [membership, modules] = await Promise.all([
    role === "SUPER_ADMIN"
      ? null
      : prisma.eventMember.findUnique({
          where: { userId_eventId: { userId, eventId } },
          select: { id: true },
        }),
    prisma.eventModules.findUnique({ where: { eventId } }),
  ]);

  if (role !== "SUPER_ADMIN" && !membership) notFound();

  return (
    <DashboardShell eventId={eventId} modules={modules}>
      {children}
    </DashboardShell>
  );
}
