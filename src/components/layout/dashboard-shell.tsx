import type { EventModules } from "@prisma/client";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function DashboardShell({
  children,
  eventId,
  modules,
}: {
  children: React.ReactNode;
  eventId?: string;
  modules?: EventModules | null;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar eventId={eventId} modules={modules} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar eventId={eventId} modules={modules} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
