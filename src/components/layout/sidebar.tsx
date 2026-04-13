"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Mail,
  Settings,
  BarChart3,
  UserCog,
  CreditCard,
  Blocks,
  QrCode,
  MessageCircle,
  FormInput,
} from "lucide-react";
import { LucideIcon } from "lucide-react";

const mainNavItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Events",
    href: "/dashboard/events",
    icon: Calendar,
  },
];

interface EventNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  module?: string; // Optional: module key that must be enabled
}

export function getEventNavItems(eventId: string): EventNavItem[] {
  return [
    {
      title: "Attendees",
      href: `/dashboard/events/${eventId}/attendees`,
      icon: Users,
    },
    {
      title: "Form Builder",
      href: `/dashboard/events/${eventId}/form-builder`,
      icon: FormInput,
    },
    {
      title: "Statistics",
      href: `/dashboard/events/${eventId}/statistics`,
      icon: BarChart3,
    },
    {
      title: "Email Templates",
      href: `/dashboard/events/${eventId}/emails/templates`,
      icon: Mail,
    },
    {
      title: "Badges",
      href: `/dashboard/events/${eventId}/badges`,
      icon: CreditCard,
    },
    // Module-dependent items (will be filtered based on enabled modules)
    {
      title: "Check-in",
      href: `/dashboard/events/${eventId}/checkin`,
      icon: QrCode,
      module: "checkIn",
    },
    {
      title: "WhatsApp",
      href: `/dashboard/events/${eventId}/whatsapp`,
      icon: MessageCircle,
      module: "whatsApp",
    },
    // Settings section
    {
      title: "Modules",
      href: `/dashboard/events/${eventId}/settings/modules`,
      icon: Blocks,
    },
    {
      title: "Settings",
      href: `/dashboard/events/${eventId}`,
      icon: Settings,
    },
  ];
}

export function Sidebar({ eventId }: { eventId?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isSuperAdmin = role === "SUPER_ADMIN";

  const eventNavItems = eventId ? getEventNavItems(eventId) : [];

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-background md:block">
      <div className="flex h-full flex-col">
        <div className="border-b px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">RegSystem</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          <div className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
            General
          </div>
          {mainNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname === item.href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          ))}

          {isSuperAdmin && (
            <Link
              href="/dashboard/users"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname === "/dashboard/users" || pathname.startsWith("/dashboard/users/")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <UserCog className="h-4 w-4" />
              Users
            </Link>
          )}

          {eventId && (
            <>
              <div className="mb-2 mt-6 px-2 text-xs font-semibold uppercase text-muted-foreground">
                Event Management
              </div>
              {eventNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    pathname === item.href || pathname.startsWith(item.href + "/")
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              ))}
            </>
          )}
        </nav>
      </div>
    </aside>
  );
}
