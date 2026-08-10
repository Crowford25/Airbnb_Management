import { redirect } from "next/navigation";

import { hasPermission, type Permission } from "../rbac";
import { safeNextPath } from "../safe-next-path";
import type { AuthRole } from "../types";
import { getSession } from "./session";

export async function requireUser(nextPath: string) {
  const session = await getSession();

  if (!session) {
    const destination = safeNextPath(nextPath) ?? "/account";
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  return session.user;
}

export async function requireRole(role: AuthRole, nextPath: string) {
  const user = await requireUser(nextPath);

  if (user.role !== role) {
    redirect("/account?error=forbidden");
  }

  return user;
}

export async function requirePermission(permission: Permission, nextPath: string) {
  const user = await requireUser(nextPath);

  if (!hasPermission(user.role, permission)) {
    redirect(
      user.role === "customer" ? "/account?error=forbidden" : "/admin?error=forbidden",
    );
  }

  return user;
}
