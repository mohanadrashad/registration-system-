import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function DashboardShell({
  children,
  eventId,
}: {
  children: React.ReactNode;
  eventId?: string;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar eventId={eventId} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar eventId={eventId} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
