import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  AppRole,
  canDelete,
  canEdit,
  canManageUsers,
  getRole,
} from "@/lib/permissions";
import {
  MODULE_INFO,
  ModuleName,
  isModuleEnabled,
} from "@/lib/guards/module-guard";
import { Event } from "@prisma/client";

export type RoleRequirement =
  | "authenticated"
  | "editor"
  | "manager"
  | "super_admin";

export interface AuthContext {
  session: {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: AppRole;
    };
  };
  role: AppRole;
}

export interface EventAuthContext extends AuthContext {
  event: Event;
}

export function apiError(
  message: string,
  status: number,
  code?: string
): NextResponse {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    { status }
  );
}

function checkRole(role: AppRole, requirement: RoleRequirement): boolean {
  switch (requirement) {
    case "authenticated":
      return true;
    case "editor":
      return canEdit(role);
    case "manager":
      return canDelete(role);
    case "super_admin":
      return canManageUsers(role);
  }
}

export async function authorize(
  requirement: RoleRequirement = "authenticated"
): Promise<AuthContext | NextResponse> {
  const session = await auth();
  if (!session?.user) return apiError("Unauthorized", 401);

  const role = getRole(session);
  if (!checkRole(role, requirement)) return apiError("Forbidden", 403);

  return { session: session as AuthContext["session"], role };
}

export async function authorizeEvent(
  eventId: string,
  options: {
    role?: RoleRequirement;
    module?: ModuleName;
  } = {}
): Promise<EventAuthContext | NextResponse> {
  const authResult = await authorize(options.role ?? "authenticated");
  if (authResult instanceof NextResponse) return authResult;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return apiError("Event not found", 404);

  if (options.module) {
    const enabled = await isModuleEnabled(eventId, options.module);
    if (!enabled) {
      return apiError(
        `Module "${MODULE_INFO[options.module].name}" is not enabled for this event`,
        403,
        "MODULE_NOT_ENABLED"
      );
    }
  }

  return { ...authResult, event };
}
