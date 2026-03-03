export type AppRole = "VIEWER" | "EDITOR" | "MANAGER" | "SUPER_ADMIN";

export function getRole(session: { user?: { role?: string } } | null): AppRole {
  return (session?.user?.role as AppRole) ?? "VIEWER";
}

export function canEdit(role: AppRole): boolean {
  return ["EDITOR", "MANAGER", "SUPER_ADMIN"].includes(role);
}

export function canDelete(role: AppRole): boolean {
  return ["MANAGER", "SUPER_ADMIN"].includes(role);
}

export function canManageUsers(role: AppRole): boolean {
  return role === "SUPER_ADMIN";
}

export const ROLE_LABELS: Record<AppRole, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
  MANAGER: "Manager",
  SUPER_ADMIN: "Super Admin",
};
