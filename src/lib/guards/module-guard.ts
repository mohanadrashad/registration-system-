import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { EventModules } from "@prisma/client";

export type ModuleName = keyof Omit<
  EventModules,
  "id" | "eventId" | "createdAt" | "updatedAt"
>;

export const MODULE_INFO: Record<
  ModuleName,
  {
    name: string;
    description: string;
    category: "core" | "communication" | "registration" | "event-day" | "attendee" | "advanced";
  }
> = {
  formBuilder: {
    name: "Form Builder",
    description: "Create custom registration forms with drag-and-drop fields",
    category: "core",
  },
  checkIn: {
    name: "Check-in System",
    description: "QR code scanning and attendance tracking at event entry",
    category: "event-day",
  },
  whatsApp: {
    name: "WhatsApp Notifications",
    description: "Send confirmations, reminders, and badges via WhatsApp",
    category: "communication",
  },
  sessions: {
    name: "Sessions & Agenda",
    description: "Manage event schedule, sessions, and speakers",
    category: "event-day",
  },
  payments: {
    name: "Payment Collection",
    description: "Accept payments during registration (Stripe)",
    category: "advanced",
  },
  selfServicePortal: {
    name: "Self-Service Portal",
    description: "Allow attendees to view and edit their registration",
    category: "attendee",
  },
  approvalWorkflow: {
    name: "Approval Workflow",
    description: "Manually approve or reject registration requests",
    category: "registration",
  },
  waitlist: {
    name: "Waitlist",
    description: "Automatically waitlist registrations when capacity is reached",
    category: "registration",
  },
  multiLanguage: {
    name: "Multi-Language",
    description: "Support Arabic/English toggle on registration forms",
    category: "attendee",
  },
  customDomain: {
    name: "Custom Domain",
    description: "Use your own domain for registration pages",
    category: "advanced",
  },
  customEmail: {
    name: "Custom Email Sender",
    description: "Use custom SMTP settings for this event's emails",
    category: "communication",
  },
  webhooks: {
    name: "Webhooks",
    description: "Send registration data to external services",
    category: "advanced",
  },
  postRegPhases: {
    name: "Post-Registration Phases",
    description: "Collect additional info after registration (flight, hotel, etc.) with per-phase open/close windows",
    category: "registration",
  },
};

/**
 * Check if a specific module is enabled for an event
 */
export async function isModuleEnabled(
  eventId: string,
  moduleName: ModuleName
): Promise<boolean> {
  const modules = await prisma.eventModules.findUnique({
    where: { eventId },
  });

  if (!modules) return false;
  return modules[moduleName] === true;
}

/**
 * API route guard - returns error response if module is not enabled
 */
export async function requireModule(
  eventId: string,
  moduleName: ModuleName
): Promise<NextResponse | null> {
  const enabled = await isModuleEnabled(eventId, moduleName);

  if (!enabled) {
    return NextResponse.json(
      {
        error: `Module "${MODULE_INFO[moduleName].name}" is not enabled for this event`,
        code: "MODULE_NOT_ENABLED",
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Get all module states for an event
 */
export async function getEventModules(eventId: string): Promise<EventModules | null> {
  return prisma.eventModules.findUnique({
    where: { eventId },
  });
}

/**
 * Get enabled modules as array of names
 */
export async function getEnabledModules(eventId: string): Promise<ModuleName[]> {
  const modules = await getEventModules(eventId);
  if (!modules) return [];

  const enabled: ModuleName[] = [];
  for (const key of Object.keys(MODULE_INFO) as ModuleName[]) {
    if (modules[key]) {
      enabled.push(key);
    }
  }

  return enabled;
}

/**
 * Update module state for an event
 */
export async function updateModuleState(
  eventId: string,
  moduleName: ModuleName,
  enabled: boolean
): Promise<EventModules> {
  return prisma.eventModules.update({
    where: { eventId },
    data: { [moduleName]: enabled },
  });
}

/**
 * Create default modules for a new event
 */
export async function createDefaultModules(eventId: string): Promise<EventModules> {
  return prisma.eventModules.create({
    data: { eventId },
  });
}
